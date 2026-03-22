import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import CopyousExtension from '../../extension.js';
import { ClipboardHistory, ItemType, Tag } from '../common/constants.js';
import { ClipboardEntry, Metadata } from './database.js';
import { MemoryDatabase } from './memory.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');

const DATABASE_VERSION = 2;

interface JsonClipboardEntry {
	type: string;
	content: string;
	pinned: boolean;
	tag: string | null;
	datetime: string;
	metadata: Metadata | null;
	title: string | undefined;
}

interface JsonDatabaseModel {
	version: number;
	entries: JsonClipboardEntry[];
}

/**
 * In memory database
 */
export class JsonDatabase extends MemoryDatabase {
	private _saveTimeoutId: number = -1;

	constructor(
		private ext: CopyousExtension,
		private file: Gio.File,
	) {
		super();
	}

	public override async init(): Promise<void> {
		await super.init();

		if (!this.file.query_exists(null)) {
			return;
		}

		const [contents] = await this.file.load_contents_async(null);
		const document = JSON.parse(new TextDecoder().decode(contents)) as JsonDatabaseModel;

		for (const entry of document.entries) {
			const clipboardEntry = new ClipboardEntry(
				this._id++,
				entry.type as ItemType,
				entry.content,
				entry.pinned,
				entry.tag as Tag | null,
				GLib.DateTime.new_from_iso8601(entry.datetime, GLib.TimeZone.new_utc()),
				entry.metadata,
				entry.title,
			);

			const key = this.entryToKey(clipboardEntry);
			this._entries.set(key, clipboardEntry);
			this._keys.set(clipboardEntry.id, key);
		}
	}

	public override async clear(history: ClipboardHistory): Promise<number[]> {
		const deleted = await super.clear(history);
		if (deleted.length > 0) this.save();
		return deleted;
	}

	public override async close(): Promise<void> {
		if (this._saveTimeoutId >= 0) GLib.source_remove(this._saveTimeoutId);
		await this.flush();
	}

	public override async insert(
		type: ItemType,
		content: string,
		metadata: Metadata | null = null,
	): Promise<ClipboardEntry | null> {
		const entry = await super.insert(type, content, metadata);
		if (entry !== null) this.save();
		return entry;
	}

	public override async updateProperty(
		entry: ClipboardEntry,
		property: Exclude<keyof ClipboardEntry, keyof GObject.Object>,
	): Promise<number> {
		const result = await super.updateProperty(entry, property);
		if (result < 0) this.save();
		return result;
	}

	public override async delete(entry: ClipboardEntry): Promise<boolean> {
		const deleted = await super.delete(entry);
		if (deleted) this.save();
		return deleted;
	}

	public override async deleteOldest(offset: number, olderThanMinutes: number): Promise<number[]> {
		const deleted = await super.deleteOldest(offset, olderThanMinutes);
		if (deleted.length > 0) this.save();
		return deleted;
	}

	private save(): void {
		if (this._saveTimeoutId >= 0) GLib.source_remove(this._saveTimeoutId);
		this._saveTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
			this.flush().catch(() => {});
			this._saveTimeoutId = -1;
			return GLib.SOURCE_REMOVE;
		});
	}

	private async flush(): Promise<void> {
		try {
			const database: JsonDatabaseModel = {
				version: DATABASE_VERSION,
				entries: Array.from(
					this._entries.values(),
					(entry): JsonClipboardEntry => ({
						type: entry.type,
						content: entry.content,
						pinned: entry.pinned,
						tag: entry.tag,
						datetime: entry.datetime.to_utc()!.format_iso8601()!,
						metadata: entry.metadata,
						title: entry.title || undefined,
					}),
				),
			};

			const dir = this.file.get_parent();
			if (dir && !dir.query_exists(null)) {
				dir.make_directory_with_parents(null);
			}

			const bytes = new TextEncoder().encode(JSON.stringify(database));
			await this.file.replace_contents_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
		} catch (error) {
			this.ext.logger.error('Failed to save JSON database', error);
		}
	}
}
