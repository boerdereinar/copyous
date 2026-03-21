import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import { ClipboardHistory, ItemType, Tag } from '../common/constants.js';
import { int32ParamSpec, registerClass } from '../common/gjs.js';

/**
 * Metadata.
 */
export type Metadata = CodeMetadata | FileMetadata | LinkMetadata;

/**
 * Programming language.
 */
export interface Language {
	id: string;
	name: string;
}

/**
 * Code metadata.
 */
export interface CodeMetadata {
	language: Language | null;
}

/**
 * File operation.
 */
export const FileOperation = {
	Copy: 'copy',
	Cut: 'cut',
} as const;

export type FileOperation = (typeof FileOperation)[keyof typeof FileOperation];

/**
 * File metadata.
 */
export interface FileMetadata {
	operation: FileOperation;
}

/**
 * Link metadata.
 */
export interface LinkMetadata {
	title: string | null;
	description: string | null;
	image: string | null;
}

/**
 * Clipboard entry.
 */
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

/**
 * Clipboard database
 */
export interface Database {
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
	 * @returns The inserted entry or null if the insertion failed.
	 */
	insert(type: ItemType, content: string, metadata: Metadata | null): Promise<ClipboardEntry | null>;

	/**
	 * Updates a property of an inserted database entry.
	 * @param entry The entry to update the property of.
	 * @param property The property of the entry to update.
	 * @returns -1 if the property was updated, the id of a conflicting entry otherwise.
	 */
	updateProperty<K extends Exclude<keyof ClipboardEntry, keyof GObject.Object | 'id'>>(
		entry: ClipboardEntry,
		property: K,
	): Promise<number>;

	/**
	 * Delete an entry from the database.
	 * @param entry The entry to delete.
	 * @returns true if the entry was deleted, false otherwise.
	 */
	delete(entry: ClipboardEntry): Promise<boolean>;

	/**
	 * Delete the oldest entries of the database.
	 * @param offset The number of entries to keep.
	 * @param olderThanMinutes Items older than this value will be deleted.
	 * @returns The ids of entries that were deleted.
	 */
	deleteOldest(offset: number, olderThanMinutes: number): Promise<number[]>;
}
