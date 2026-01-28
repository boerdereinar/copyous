import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import type Gda from 'gi://Gda';
import Gio from 'gi://Gio';

import type CopyousExtension from '../../extension.js';
import { ClipboardHistory, ItemType, Tag, getDataPath } from '../common/constants.js';
import { int32ParamSpec, registerClass } from '../common/gjs.js';
import {
	SqlBuilder,
	add_expr_value,
	async_statement_execute_non_select,
	async_statement_execute_select,
	convert_datetime,
	new_connection,
	open_async,
	unescape_sql,
} from './gda.js';
import { getLinkImagePath } from './link.js';

export type Metadata = CodeMetadata | FileMetadata | LinkMetadata;

export interface Language {
	id: string;
	name: string;
}

export interface CodeMetadata {
	language: Language | null;
}

export const FileOperation = {
	Copy: 'COPY',
	Cut: 'CUT',
} as const;

export type FileOperation = (typeof FileOperation)[keyof typeof FileOperation];

export interface FileMetadata {
	operation: FileOperation;
}

export interface LinkMetadata {
	title: string | null;
	description: string | null;
	image: string | null;
}

@registerClass({
	Properties: {
		id: int32ParamSpec('id', GObject.ParamFlags.READABLE, 0),
		type: GObject.ParamSpec.string('type', null, null, GObject.ParamFlags.READWRITE, ItemType.Text),
		content: GObject.ParamSpec.string('content', null, null, GObject.ParamFlags.READWRITE, ''),
		pinned: GObject.ParamSpec.boolean('pinned', null, null, GObject.ParamFlags.READWRITE, false),
		tag: GObject.ParamSpec.string('tag', null, null, GObject.ParamFlags.READWRITE, ''),
		datetime: GObject.ParamSpec.boxed('datetime', null, null, GObject.ParamFlags.READWRITE, GLib.DateTime),
		metadata: GObject.ParamSpec.jsobject('metadata', null, null, GObject.ParamFlags.READWRITE),
		title: GObject.ParamSpec.string('title', null, null, GObject.ParamFlags.READWRITE, ''),
	},
	Signals: {
		delete: {},
	},
})
export class ClipboardEntry extends GObject.Object {
	private readonly _id: number;
	declare type: ItemType;
	declare content: string;
	declare pinned: boolean;
	declare tag: Tag | null;
	declare datetime: GLib.DateTime;
	declare metadata: Metadata | null;
	declare title: string;

	constructor(
		id: number,
		type: ItemType,
		content: string,
		pinned: boolean,
		tag: Tag | null,
		datetime: GLib.DateTime,
		metadata: Metadata | null = null,
		title: string = '',
	) {
		super();

		this._id = id;
		this.type = type;
		this.content = content;
		this.pinned = pinned;
		this.tag = tag;
		this.datetime = datetime;
		this.metadata = metadata;
		this.title = title;
	}

	get id() {
		return this._id;
	}
}

export class ClipboardEntryTracker {
	private _database: Database | undefined;
	private _entries: Map<number, ClipboardEntry> = new Map();

	constructor(private ext: CopyousExtension) {}

	async init(): Promise<ClipboardEntry[]> {
		if (this._database) {
			await this.clear();
			await this.destroy();
		}

		try {
			// Check if DEBUG_COPYOUS_GDA_VERSION is set
			const environment = GLib.get_environ();
			const gdaVersion = GLib.environ_getenv(environment, 'DEBUG_COPYOUS_GDA_VERSION');
			if (gdaVersion) {
				imports.package.require({ Gda: gdaVersion });
			}
		} catch (err) {
			this.ext.logger.warn(err);
		}

		let gda: typeof Gda | null = null;
		try {
			gda = (await import('gi://Gda')).default;
		} catch {
			this.ext.logger.error('Failed to load Gda');

			if (!this.ext.settings.get_boolean('disable-gda-warning')) {
				this.ext.notificationManager?.warning(
					_('Failed to load Gda'),
					_('Clipboard history will be disabled'),
					[_('Disable Warning'), () => this.ext.settings.set_boolean('disable-gda-warning', true)],
				);
			}
		}

		if (gda) {
			try {
				// Create database
				this.ext.logger.log('Using Gda', gda.__version__, 'database');
				this._database = new GdaDatabase(this.ext, gda);
				await this._database.init();

				// First get entries and track them
				const entries = await this._database.entries();
				entries.forEach((entry) => this.track(entry));

				// Then delete the oldest entries so that images are deleted
				await this.deleteOldest();

				return entries;
			} catch (e) {
				this.ext.logger.error('Failed to initialize Gda database', e);
				this.ext.notificationManager?.warning(
					_('Failed to load database'),
					_('Clipboard history will be disabled'),
				);
			}
		}

		this.ext.logger.log('Using in-memory database');
		this._database = new MemoryDatabase();
		await this._database.init();
		return [];
	}

	public async clear(history: ClipboardHistory | null = null) {
		if (!this._database) return;

		history ??= this.ext.settings.get_enum('clipboard-history') as ClipboardHistory;
		const deleted = await this._database.clear(history);
		deleted.forEach((id) => this.deleteFromDatabase(id));
	}

	public async destroy() {
		await this._database?.close();
		this._database = undefined;
	}

	/**
	 * Inserts an entry into the database
	 * @param type The type of the entry
	 * @param content The content of the entry
	 * @param metadata The metadata of the entry
	 * @returns The inserted entry or null if the entry could not be inserted or is already tracked
	 */
	public async insert(
		type: ItemType,
		content: string,
		metadata: Metadata | null = null,
	): Promise<ClipboardEntry | null> {
		const id = await this._database?.selectConflict({ type, content });
		if (id) {
			// Check if the entry is already tracked
			const trackedEntry = this._entries.get(id);
			if (trackedEntry) {
				trackedEntry.datetime = GLib.DateTime.new_now_utc();
				return null;
			}
		}

		const entry = await this._database?.insert(type, content, metadata);
		if (!entry) return null;

		// Start tracking it
		this.track(entry);

		// Also delete oldest entries
		await this.deleteOldest();

		return entry;
	}

	public checkOldest(): boolean {
		const M = this.ext.settings.get_int('history-time');
		if (M === 0) return false;

		const now = GLib.DateTime.new_now_utc();
		const olderThan = now.add_minutes(-M)!;

		for (const entry of this._entries.values()) {
			if (entry.pinned || entry.tag) continue;
			if (entry.datetime.compare(olderThan) < 0) return true;
		}

		return false;
	}

	public async deleteOldest() {
		const N = this.ext.settings.get_int('history-length');
		const M = this.ext.settings.get_int('history-time');
		const deleted = await this._database?.deleteOldest(N, M);
		if (deleted) deleted.forEach((id) => this.deleteFromDatabase(id));
	}

	private track(entry: ClipboardEntry) {
		entry.connect('notify::content', async () => {
			const id = await this._database?.updateProperty(entry, 'content');
			// If entry conflicts with another entry, delete it
			if (id !== undefined && id >= 0) {
				entry.emit('delete');

				// Update the date of the other entry
				const conflicted = this._entries.get(id);
				if (conflicted) {
					conflicted.datetime = entry.datetime;
				}
			}
		});
		entry.connect('notify::pinned', () => this._database?.updateProperty(entry, 'pinned'));
		entry.connect('notify::tag', () => this._database?.updateProperty(entry, 'tag'));
		entry.connect('notify::datetime', () => this._database?.updateProperty(entry, 'datetime'));
		entry.connect('notify::metadata', () => this._database?.updateProperty(entry, 'metadata'));
		entry.connect('notify::title', () => this._database?.updateProperty(entry, 'title'));
		entry.connect('delete', () => this.delete(entry));
		this._entries?.set(entry.id, entry);
	}

	private async delete(entry: ClipboardEntry) {
		if (entry.type === ItemType.Image) {
			// Delete image
			try {
				const file = Gio.File.new_for_uri(entry.content);
				if (file.query_exists(null)) {
					file.delete(null);
				}
			} catch {
				this.ext.logger.error('Failed to delete image', entry.content);
			}
		} else if (entry.type === ItemType.Link && entry.metadata) {
			// Delete thumbnail image
			const metadata: { image: string | null } = { image: null, ...entry.metadata };
			if (metadata.image) {
				try {
					const file = getLinkImagePath(this.ext, metadata.image);
					if (file?.query_exists(null)) {
						file.delete(null);
					}
				} catch {
					this.ext.logger.error('Failed to delete thumbnail image', metadata.image);
				}
			}
		}

		// Delete from database if not deleted already
		if (this._entries.has(entry.id)) {
			await this._database?.delete(entry);
			this._entries.delete(entry.id);
		}
	}

	private deleteFromDatabase(id: number) {
		const entry = this._entries.get(id);
		if (entry) {
			this._entries.delete(id);
			entry.emit('delete');
		}
	}
}

/**
 * Clipboard database
 */
interface Database {
	/**
	 * Initializes the database
	 */
	init(): Promise<void>;

	/**
	 * Clears the database.
	 * @param history Which items to keep.
	 */
	clear(history: ClipboardHistory): Promise<number[]>;

	/**
	 * Close the connection to the database.
	 */
	close(): Promise<void>;

	/**
	 * Gets the entries of the database.
	 */
	entries(): Promise<ClipboardEntry[]>;

	/**
	 * Select a conflicting entry by its type and content.
	 * @param entry The entry to search its conflict for.
	 * @returns The id of the conflicting entry or null if no conflict was found.
	 */
	selectConflict(entry: ClipboardEntry | { type: ItemType; content: string }): Promise<number | null>;

	/**
	 * Inserts an entry into the database.
	 * @param type The type of the entry.
	 * @param content The content of the entry.
	 * @param metadata Metadata of the entry.
	 */
	insert(type: ItemType, content: string, metadata: Metadata | null): Promise<ClipboardEntry | null>;

	/**
	 * Updates a property of an inserted database entry.
	 * @param entry The entry to update the property of.
	 * @param property The property of the entry to update.
	 * @returns -1 if the property was updates, an id of a conflicting entry otherwise.
	 */
	updateProperty(
		entry: ClipboardEntry,
		property: Exclude<keyof ClipboardEntry, keyof GObject.Object>,
	): Promise<number>;

	/**
	 * Delete an entry from the database.
	 * @param entry The entry to delete.
	 */
	delete(entry: ClipboardEntry): Promise<void>;

	/**
	 * Delete the oldest entries of the database.
	 * @param offset The number of entries to keep.
	 * @param olderThanMinutes Items older than this value will be deleted.
	 * @returns The ids of entries that were deleted.
	 */
	deleteOldest(offset: number, olderThanMinutes: number): Promise<number[]>;
}

/**
 * In memory database
 */
class MemoryDatabase implements Database {
	private _entries: Map<string, ClipboardEntry> = new Map();
	private _keys: Map<number, string> = new Map();
	private _id: number = 0;

	constructor() {}

	public async init(): Promise<void> {}

	public clear(history: ClipboardHistory): Promise<number[]> {
		let deleted: number[] = [];
		switch (history) {
			case ClipboardHistory.Clear:
				deleted = Array.from(this._keys.keys());
				this._entries.clear();
				this._keys.clear();
				break;
			case ClipboardHistory.KeepPinnedAndTagged:
				deleted = [];
				for (const [key, entry] of this._entries) {
					if (!(entry.pinned || entry.tag)) {
						this._entries.delete(key);
						this._keys.delete(entry.id);
						deleted.push(entry.id);
					}
				}
				break;
			case ClipboardHistory.KeepAll:
				break;
		}

		return Promise.resolve(deleted);
	}

	public async close(): Promise<void> {
		await this.clear(ClipboardHistory.Clear);
	}

	public entries(): Promise<ClipboardEntry[]> {
		const entries = Array.from(this._entries.values()).sort((a, b) => b.datetime.compare(a.datetime));
		return Promise.resolve(entries);
	}

	public selectConflict(entry: ClipboardEntry | { type: ItemType; content: string }): Promise<number | null> {
		const key = `${entry.type}:${entry.content}`;
		return Promise.resolve(this._entries.get(key)?.id ?? null);
	}

	public insert(type: ItemType, content: string, metadata: Metadata | null = null): Promise<ClipboardEntry | null> {
		const key = `${type}:${content}`;
		const entry = this._entries.get(key);
		if (entry) {
			return Promise.resolve(null);
		} else {
			const newEntry = new ClipboardEntry(
				this._id++,
				type,
				content,
				false,
				null,
				GLib.DateTime.new_now_utc(),
				metadata,
			);
			this._entries.set(key, newEntry);
			this._keys.set(newEntry.id, key);
			return Promise.resolve(newEntry);
		}
	}

	public updateProperty(
		entry: ClipboardEntry,
		property: Exclude<keyof ClipboardEntry, keyof GObject.Object>,
	): Promise<number> {
		if (property !== 'content') return Promise.resolve(-1);

		const key = `${entry.type}:${entry.content}`;
		const existingEntry = this._entries.get(key);
		if (existingEntry) {
			return Promise.resolve(existingEntry.id);
		} else {
			const prevKey = this._keys.get(entry.id);
			if (prevKey) this._entries.delete(prevKey);

			this._entries.set(key, entry);
			this._keys.set(entry.id, key);
			return Promise.resolve(-1);
		}
	}

	public delete(entry: ClipboardEntry): Promise<void> {
		const key = this._keys.get(entry.id);
		this._keys.delete(entry.id);
		if (key) this._entries.delete(key);

		return Promise.resolve();
	}

	public async deleteOldest(offset: number, olderThanMinutes: number): Promise<number[]> {
		const entries = await this.entries();
		let deleted = entries
			.filter((e) => !(e.pinned || e.tag))
			.map((e) => e.id)
			.slice(offset);

		if (olderThanMinutes > 0) {
			const now = GLib.DateTime.new_now_utc();
			const olderThan = now.add_minutes(-olderThanMinutes)!;
			deleted = [
				...new Set([
					...deleted,
					...entries
						.filter((e) => !(e.pinned || e.tag) && e.datetime.compare(olderThan) < 0)
						.map((e) => e.id),
				]),
			];
		}

		for (const id of deleted) {
			const key = this._keys.get(id);
			this._keys.delete(id);
			if (key) this._entries.delete(key);
		}

		return deleted;
	}
}

// Remove double backslashes since libgda's sqlite escaping is broken
function unescapeContent(content: string): string {
	return content.replace(/\\\\/g, '\\');
}

/**
 * Database with Gda backend
 */
export class GdaDatabase implements Database {
	private readonly _Gda: typeof Gda;
	private readonly _connection: Gda.Connection;
	private readonly _cancellable: Gio.Cancellable = new Gio.Cancellable();

	constructor(
		private ext: CopyousExtension,
		gda: typeof Gda,
	) {
		this._Gda = gda;

		const location = this.ext.settings.get_string('database-location');
		const inMemory = this.ext.settings.get_boolean('in-memory-database');

		// Check if DEBUG_COPYOUS_DBPATH is set
		const environment = GLib.get_environ();
		const debugPath = GLib.environ_getenv(environment, 'DEBUG_COPYOUS_DBPATH');
		if (debugPath) ext.logger.log('Using debug database');

		// Get database location or use default ${XDG_DATA_HOME}/${EXTENSION UUID}
		const database = Gio.File.new_for_path(debugPath ?? location);
		const dir = database.get_parent() ?? getDataPath(ext);

		// Use in memory database :memory:, database name, or default clipboard.db
		const file = inMemory ? ':memory:' : (database.get_basename() ?? 'clipboard.db');

		// Create database directory
		if (!dir.query_exists(null)) {
			dir.make_directory_with_parents(null);
		}

		// Establish connection
		const cncString = `DB_DIR=${dir.get_path()};DB_NAME=${file.replace(/\.db$/, '')}`;
		this._connection = new_connection(this._Gda, cncString);
	}

	public async init(): Promise<void> {
		await open_async(this._connection);

		// Get current schema version
		const [versionStmt] = this._connection.parse_sql_string(`PRAGMA user_version;`);
		const versionResult = await async_statement_execute_select<{ user_version: number }>(
			this._Gda,
			this._connection,
			versionStmt,
			this._cancellable,
		);
		const versionIter = versionResult.create_iter();
		versionIter.move_next();
		const version = (versionIter.get_value_at(0) as number | null) ?? 0;

		// Run migrations based on version
		switch (version) {
			case 0: {
				// Create table
				const [stmt] = this._connection.parse_sql_string(`
					CREATE TABLE IF NOT EXISTS 'clipboard' (
						'id'       integer   NOT NULL UNIQUE PRIMARY KEY AUTOINCREMENT,
						'type'     text      NOT NULL,
						'content'  text      NOT NULL,
						'pinned'   boolean   NOT NULL,
						'tag'      text,
						'datetime' timestamp NOT NULL,
						'metadata' text,
						UNIQUE ('type', 'content')
					);
				`);
				await async_statement_execute_non_select(this._Gda, this._connection, stmt, this._cancellable);
			}
			/* falls through */
			case 1: {
				// Add title column
				try {
					const [addColumnStmt] = this._connection.parse_sql_string(
						`ALTER TABLE 'clipboard' ADD COLUMN 'title' text;`,
					);
					await async_statement_execute_non_select(
						this._Gda,
						this._connection,
						addColumnStmt,
						this._cancellable,
					);
				} catch {
					// Column may already exist if table was created with title column
				}
			}
		}

		// Update to current version (use execute_select since libgda treats PRAGMA as SELECT)
		const [setVersionStmt] = this._connection.parse_sql_string(`PRAGMA user_version = 2;`);
		await async_statement_execute_select(this._Gda, this._connection, setVersionStmt, this._cancellable);
	}

	public async clear(history: ClipboardHistory): Promise<number[]> {
		try {
			if (history === ClipboardHistory.KeepAll) {
				return [];
			}

			// SELECT id FROM table (WHERE NOT (pinned == true OR tag IS NOT NULL))?
			const [selectBuilder, where] = this.selectToDeleteBuilder(history === ClipboardHistory.KeepPinnedAndTagged);

			const selectStmt = selectBuilder.get_statement();
			const datamodel = await async_statement_execute_select<ClipboardEntry>(
				this._Gda,
				this._connection,
				selectStmt,
				this._cancellable,
			);

			const deleted: number[] = [];
			const iter = datamodel.create_iter();
			while (iter.move_next()) {
				deleted.push(iter.get_value_for_field('id'));
			}

			// Only delete if there are entries to delete
			if (deleted.length > 0) {
				// DELETE FROM table (WHERE ...)? RETURNING id;
				const deleteBuilder = new this._Gda.SqlBuilder({ stmt_type: this._Gda.SqlStatementType.DELETE });
				deleteBuilder.set_table('clipboard');

				if (where) {
					deleteBuilder.set_where(
						deleteBuilder.import_expression_from_builder(selectBuilder as Gda.SqlBuilder, where),
					);
				}

				const deleteStmt = deleteBuilder.get_statement();
				await async_statement_execute_non_select(this._Gda, this._connection, deleteStmt, this._cancellable);
			}

			return deleted;
		} catch (e) {
			this.ext.logger.error('Failed to clear clipboard', e);
		}

		return [];
	}

	public close(): Promise<void> {
		this._connection.close();
		this._cancellable.cancel();
		return Promise.resolve();
	}

	public async entries(): Promise<ClipboardEntry[]> {
		try {
			// SELECT * FROM clipboard
			const builder = new this._Gda.SqlBuilder({ stmt_type: this._Gda.SqlStatementType.SELECT });
			builder.select_add_target('clipboard', null);
			builder.select_add_field('id', null, null);
			builder.select_add_field('type', null, null);
			builder.select_add_field('content', null, null);
			builder.select_add_field('pinned', null, null);
			builder.select_add_field('tag', null, null);
			const datetimeId = builder.select_add_field('datetime', null, null);
			builder.select_add_field('metadata', null, null);
			builder.select_add_field('title', null, null);
			builder.select_order_by(datetimeId, false, null);

			const stmt = builder.get_statement();
			const dataModel = await async_statement_execute_select<ClipboardEntry>(
				this._Gda,
				this._connection,
				stmt,
				this._cancellable,
			);

			const entries: ClipboardEntry[] = [];
			const iter = dataModel.create_iter();
			while (iter.move_next()) {
				const id = iter.get_value_for_field('id');
				const type = iter.get_value_for_field('type');
				const content = unescapeContent(iter.get_value_for_field('content'));
				const pinned = iter.get_value_for_field('pinned');
				const tag = iter.get_value_for_field('tag');
				let datetime = iter.get_value_for_field('datetime');
				const metadata = iter.get_value_for_field('metadata') as string | null;
				const title = (iter.get_value_for_field('title') as string | null) ?? '';

				if ('Timestamp' in this._Gda && datetime instanceof this._Gda.Timestamp) {
					const timezone = GLib.TimeZone.new_offset(datetime.timezone);
					datetime = GLib.DateTime.new(
						timezone,
						datetime.year,
						datetime.month,
						datetime.day,
						datetime.hour,
						datetime.minute,
						datetime.second,
					);
				}

				let metadataObj: Metadata | null = null;
				if (metadata) {
					try {
						const json = JSON.parse(metadata) as object | null;
						if (json) {
							metadataObj = json as Metadata;
						}
					} catch {
						this.ext.logger.error('Failed to parse metadata');
					}
				}

				entries.push(new ClipboardEntry(id, type, content, pinned, tag, datetime, metadataObj, title));
			}

			return entries;
		} catch (e) {
			this.ext.logger.error('Failed to get clipboard entries', e);
		}

		return [];
	}

	public async selectConflict(entry: ClipboardEntry | { type: ItemType; content: string }): Promise<number | null> {
		try {
			// SELECT id FROM table WHERE type == entry.type AND content == entry.content LIMIT 1
			const builder = new this._Gda.SqlBuilder({ stmt_type: this._Gda.SqlStatementType.SELECT });
			builder.select_add_target('clipboard', null);
			builder.select_add_field('id', null, null);
			builder.set_where(
				builder.add_cond(
					this._Gda.SqlOperatorType.AND,
					builder.add_cond(
						this._Gda.SqlOperatorType.EQ,
						builder.add_id('type'),
						add_expr_value(builder, entry.type),
						0,
					),
					builder.add_cond(
						this._Gda.SqlOperatorType.EQ,
						builder.add_id('content'),
						add_expr_value(builder, entry.content),
						0,
					),
					0,
				),
			);
			builder.select_set_limit(add_expr_value(builder, 1), add_expr_value(builder, 0));

			// Get id
			const stmt = builder.get_statement();
			const datamodel = await async_statement_execute_select<ClipboardEntry>(
				this._Gda,
				this._connection,
				stmt,
				this._cancellable,
			);
			const iter = datamodel.create_iter();
			if (iter.move_next()) {
				return iter.get_value_for_field('id');
			}

			return null;
		} catch (e) {
			this.ext.logger.error('Failed to select conflicting entry', e);
		}

		return null;
	}

	/// Note: content will be inserted incorrectly into the database since libgda escapes sqlite incorrectly
	public async insert(
		type: ItemType,
		content: string,
		metadata: Metadata | null = null,
	): Promise<ClipboardEntry | null> {
		try {
			// INSERT INTO table (type, content, pinned, tag, datetime, metadata)
			// VALUES (entry.type, entry.content, entry.pinned, entry.tag, entry.datetime, entry.metadata)
			const builder = new this._Gda.SqlBuilder({
				stmt_type: this._Gda.SqlStatementType.INSERT,
			}) as SqlBuilder<ClipboardEntry>;
			builder.set_table('clipboard');
			builder.add_field_value_as_gvalue('type', type);
			// NOTE: content will be inserted incorrectly
			builder.add_field_value_as_gvalue('content', content);
			builder.add_field_value_as_gvalue('pinned', false);
			const datetime = GLib.DateTime.new_now_utc();
			builder.add_field_value_as_gvalue('datetime', convert_datetime(datetime));
			if (metadata) builder.add_field_value_as_gvalue('metadata', JSON.stringify(metadata));

			// Execute
			const stmt = builder.get_statement();
			const [, row] = await async_statement_execute_non_select(
				this._Gda,
				this._connection,
				stmt,
				this._cancellable,
			);
			const id = row?.get_nth_holder(0).get_value() as unknown as number;
			if (id == null) return null;

			return new ClipboardEntry(id, type, content, false, null, datetime, metadata);
		} catch (e) {
			this.ext.logger.error('Failed to insert entry', e);
		}

		return null;
	}

	public async updateProperty(
		entry: ClipboardEntry,
		property: Exclude<keyof ClipboardEntry, keyof GObject.Object>,
	): Promise<number> {
		try {
			let value = entry[property] ?? 'NULL';
			if (property === 'metadata') value = JSON.stringify(entry[property]);
			else if (property === 'datetime') value = convert_datetime(entry[property]);

			// UPDATE table
			// SET property = entry.property
			// WHERE id == entry.id
			const builder = new this._Gda.SqlBuilder({
				stmt_type: this._Gda.SqlStatementType.UPDATE,
			}) as SqlBuilder<ClipboardEntry>;
			builder.set_table('clipboard');
			builder.add_field_value_as_gvalue(property, value);
			builder.set_where(
				builder.add_cond(
					this._Gda.SqlOperatorType.EQ,
					builder.add_id('id'),
					add_expr_value(builder, entry.id),
					0,
				),
			);

			// Escape the null value since the bindings for Gda5 do not support Gda.Null
			const stmt = unescape_sql(this._connection, builder);

			const [rows] = await async_statement_execute_non_select(
				this._Gda,
				this._connection,
				stmt,
				this._cancellable,
			);
			if (rows !== -1 || (property !== 'type' && property !== 'content')) {
				return -1; // success
			}

			// Return the id of the conflicting entry
			const id = await this.selectConflict(entry);
			return id ?? -1;
		} catch (e) {
			this.ext.logger.error(`Failed to update property "${property}" for entry ${entry.id}`, e);
		}

		return -1;
	}

	public async delete(entry: ClipboardEntry): Promise<void> {
		try {
			// DELETE FROM table WHERE id == entry.id
			const builder = new this._Gda.SqlBuilder({
				stmt_type: this._Gda.SqlStatementType.DELETE,
			}) as SqlBuilder<ClipboardEntry>;
			builder.set_table('clipboard');
			builder.set_where(
				builder.add_cond(
					this._Gda.SqlOperatorType.EQ,
					builder.add_id('id'),
					add_expr_value(builder, entry.id),
					0,
				),
			);

			const stmt = builder.get_statement();
			await async_statement_execute_non_select(this._Gda, this._connection, stmt, this._cancellable);
		} catch (e) {
			this.ext.logger.error(`Failed to delete entry ${entry.id}`, e);
		}
	}

	public async deleteOldest(offset: number, olderThanMinutes: number): Promise<number[]> {
		try {
			// WITH select1 AS (...) (SELECT id FROM select1) UNION (select2)
			const selectBuilder = new this._Gda.SqlBuilder({
				stmt_type: this._Gda.SqlStatementType.COMPOUND,
			}) as SqlBuilder<ClipboardEntry>;
			selectBuilder.compound_set_type(this._Gda.SqlStatementCompoundType.UNION);

			// SELECT id FROM table WHERE NOT (pinned == true OR tag IS NOT NULL) ORDER BY datetime LIMIT -1 OFFSET offset
			const [select1Builder] = this.selectToDeleteBuilder();
			select1Builder.select_order_by(select1Builder.add_id('datetime'), false, null);
			select1Builder.select_set_limit(add_expr_value(select1Builder, -1), add_expr_value(select1Builder, offset));

			// SELECT id FROM table WHERE NOT (pinned == true OR tag IS NOT NULL) AND datetime < DATETIME('now', '-n minutes')
			let selectStmt: Gda.Statement;
			if (olderThanMinutes > 0) {
				// Workaround for ORDER BY not working inside compound selector and add_subselect not being exposed in Gda 5.0
				const workAroundBuilder = new this._Gda.SqlBuilder({ stmt_type: this._Gda.SqlStatementType.SELECT });
				workAroundBuilder.select_add_field('id', null, null);
				workAroundBuilder.select_add_target('select1', null);
				selectBuilder.compound_add_sub_select_from_builder(workAroundBuilder);

				const [select2Builder] = this.selectToDeleteBuilder(true, olderThanMinutes);
				selectBuilder.compound_add_sub_select_from_builder(select2Builder as Gda.SqlBuilder);

				// SELECT id FROM (SELECT id FROM table WHERE ...)
				const select1Sql = this._connection.statement_to_sql(select1Builder.get_statement(), null, null)[0];
				const selectSql = this._connection.statement_to_sql(selectBuilder.get_statement(), null, null)[0];
				selectStmt = this._connection.parse_sql_string(selectSql.replace('select1', `(${select1Sql})`))[0];
			} else {
				// Ignore compound selector
				selectStmt = select1Builder.get_statement();
			}

			// Run select
			const datamodel = await async_statement_execute_select<ClipboardEntry>(
				this._Gda,
				this._connection,
				selectStmt,
				this._cancellable,
			);

			// DELETE FROM table WHERE id IN (select)
			// add_subselect is not exposed as a javascript binding in Gda 5.0
			const selectSql = this._connection.statement_to_sql(selectStmt, selectStmt.get_parameters()[1], null)[0];
			const [deleteStmt] = this._connection.parse_sql_string(`DELETE FROM clipboard WHERE id IN (${selectSql})`);
			const [rows] = await async_statement_execute_non_select(
				this._Gda,
				this._connection,
				deleteStmt,
				this._cancellable,
			);

			// Get ids
			const deleted: number[] = [];
			if (rows > 0) {
				const iter = datamodel.create_iter();
				while (iter.move_next()) {
					deleted.push(iter.get_value_for_field('id'));
				}
			}

			return deleted;
		} catch (e) {
			this.ext.logger.error('Failed to delete oldest entries', e);
		}

		return [];
	}

	private selectToDeleteBuilder(
		includeWhere: boolean = true,
		olderThanMinutes: number = 0,
	): [SqlBuilder<ClipboardEntry>, Gda.SqlBuilderId | null] {
		// SELECT id FROM table (WHERE NOT (pinned == true OR tag IS NOT NULL) (AND datetime < DATETIME('now', '-n minutes'))?)?
		const builder = new this._Gda.SqlBuilder({
			stmt_type: this._Gda.SqlStatementType.SELECT,
		}) as SqlBuilder<ClipboardEntry>;
		builder.select_add_field('id', null, null);
		builder.select_add_target('clipboard', null);

		let where = null;
		if (includeWhere) {
			// WHERE NOT (pinned == true OR tag IS NOT NULL)
			where = builder.add_cond(
				this._Gda.SqlOperatorType.NOT,
				builder.add_cond(
					this._Gda.SqlOperatorType.OR,
					builder.add_cond(
						this._Gda.SqlOperatorType.EQ,
						builder.add_id('pinned'),
						add_expr_value(builder, true),
						0,
					),
					builder.add_cond(this._Gda.SqlOperatorType.ISNOTNULL, builder.add_id('tag'), 0, 0),
					0,
				),
				0,
				0,
			);

			// AND datetime < DATETIME('now', '-n minutes')
			if (olderThanMinutes > 0) {
				where = builder.add_cond(
					this._Gda.SqlOperatorType.AND,
					where,
					builder.add_cond(
						this._Gda.SqlOperatorType.LT,
						builder.add_id('datetime'),
						builder.add_function('DATETIME', [
							add_expr_value(builder, 'now'),
							add_expr_value(builder, `-${olderThanMinutes} minutes`),
						]),
						0,
					),
					0,
				);
			}

			builder.set_where(where);
		}

		return [builder, where];
	}
}
