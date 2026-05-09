import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import Gst from 'gi://Gst';
import St from 'gi://St';

import { Extension, gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { enumParamSpec, registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';
import { TextCountMode } from '../../common/settings.js';
import { FileType } from './contentPreview.js';

const GraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const WordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

function formatBytes(bytes: number): [string, string] {
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	const exp = Math.floor(Math.log10(bytes) / 3);
	const value = (bytes / Math.pow(1000, exp)) % 1000;
	const formatted = value.toLocaleString('en', { maximumSignificantDigits: 2 });

	return [formatted, units[exp]!];
}

function formatTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	let res = '';
	if (h > 0) res += _('%dh').format(h) + ' ';
	if (m > 0) res += _('%dm').format(m) + ' ';
	res += _('%ds').format(s);

	return res;
}

function countLines(text: string): number {
	let count = 1;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') count++;
	}
	return count;
}

@registerClass()
export class ContentInfo extends St.BoxLayout {
	protected left: St.BoxLayout;
	protected right: St.BoxLayout;

	constructor() {
		super({
			style_class: 'content-info',
			x_expand: true,
		});

		this.left = new St.BoxLayout({
			style_class: 'content-info-left',
			x_align: Clutter.ActorAlign.START,
			x_expand: true,
		});
		this.add_child(this.left);

		this.right = new St.BoxLayout({
			style_class: 'content-info-right',
			x_align: Clutter.ActorAlign.END,
		});
		this.add_child(this.right);
	}
}

@registerClass({
	Properties: {
		'text': GObject.ParamSpec.string('text', null, null, GObject.ParamFlags.WRITABLE, ''),
		'text-count-mode': enumParamSpec('text-count-mode', GObject.ParamFlags.WRITABLE, TextCountMode, 0),
	},
})
export class TextInfo extends ContentInfo {
	private readonly _countLabel: St.Label;

	private _text: string;
	private _textCountMode: TextCountMode;

	constructor(text: string, textCountMode: TextCountMode) {
		super();

		this._countLabel = new St.Label();
		this.left.add_child(this._countLabel);

		this._text = text;
		this._textCountMode = textCountMode;
		this.updateCount();
	}

	set text(text: string) {
		if (this._text === text) return;
		this._text = text;
		this.updateCount();
	}

	set textCountMode(countMode: TextCountMode) {
		if (this._textCountMode === countMode) return;
		this._textCountMode = countMode;
		this.updateCount();
	}

	private updateCount() {
		if (this._textCountMode === TextCountMode.Characters) {
			let count = 0;
			for (const _segment of GraphemeSegmenter.segment(this._text)) count++;

			this._countLabel.text = ngettext('%d char', '%d chars', count).format(count);
		} else if (this._textCountMode === TextCountMode.Words) {
			let count = 0;
			for (const segment of WordSegmenter.segment(this._text)) {
				if (segment.isWordLike) count++;
			}

			this._countLabel.text = ngettext('%d word', '%d words', count).format(count);
		} else if (this._textCountMode === TextCountMode.Lines) {
			const count = countLines(this._text);
			this._countLabel.text = ngettext('%d line', '%d lines', count).format(count);
		}
	}
}

@registerClass({
	Properties: {
		language: GObject.ParamSpec.string('language', null, null, GObject.ParamFlags.WRITABLE, null),
	},
})
export class CodeInfo extends TextInfo {
	private readonly _languageLabel: St.Label;

	constructor(text: string, textCountMode: TextCountMode, language: string | null) {
		super(text, textCountMode);

		this._languageLabel = new St.Label({
			style_class: 'language',
			text: language ?? '',
		});
		this.right.add_child(this._languageLabel);
	}

	set language(language: string | null) {
		this._languageLabel.text = language ?? '';
	}
}

@registerClass()
export class FileInfo extends ContentInfo {
	constructor(size: number | null = null) {
		super();

		this.add_style_class_name('file-info');

		if (size !== null) {
			const [value, unit] = formatBytes(size);

			const sizeBox = new St.BoxLayout({ style_class: 'file-info-size' });
			sizeBox.add_child(new St.Label({ style_class: 'content-info-number', text: value }));
			sizeBox.add_child(
				new St.Label({
					style_class: 'file-info-unit',
					text: unit,
					y_align: Clutter.ActorAlign.END,
				}),
			);
			this.left.add_child(sizeBox);
		}
	}
}

@registerClass()
export class MissingFileInfo extends FileInfo {
	constructor(ext: Extension) {
		super();

		this.add_style_class_name('missing-info');

		this.left.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.Warning) }));
		this.left.add_child(new St.Label({ text: _('Missing File') }));
	}
}

@registerClass()
export class ErrorFileInfo extends FileInfo {
	constructor(ext: Extension) {
		super();

		this.add_style_class_name('error-info');

		this.left.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.Warning) }));
		this.left.add_child(new St.Label({ text: _('Error') }));
	}
}

@registerClass()
export class DirectoryInfo extends FileInfo {
	constructor(ext: Extension, directoryCount: number, fileCount: number) {
		super();

		this.add_style_class_name('directory-info');

		const directories = new St.BoxLayout({ style_class: 'directory-count' });
		directories.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.Folder) }));
		directories.add_child(new St.Label({ style_class: 'content-info-number', text: directoryCount.toString() }));
		this.left.add_child(directories);

		const files = new St.BoxLayout({ style_class: 'file-count' });
		files.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.File) }));
		files.add_child(new St.Label({ style_class: 'content-info-number', text: fileCount.toString() }));
		this.left.add_child(files);
	}
}

@registerClass()
export class ImageInfo extends FileInfo {
	constructor(size: number, width: number, height: number) {
		super(size);

		this.add_style_class_name('image-info');

		const dimensions = new St.BoxLayout({ style_class: 'image-dimensions' });
		dimensions.add_child(new St.Label({ text: `${width}×${height}` }));
		this.right.add_child(dimensions);
	}
}

@registerClass()
export class MediaInfo extends FileInfo {
	constructor(ext: Extension, size: number, seconds: number) {
		super(size);

		this.add_style_class_name('media-info');

		const duration = new St.BoxLayout({ style_class: 'media-duration', y_align: Clutter.ActorAlign.END });
		duration.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.Duration) }));
		duration.add_child(new St.Label({ text: formatTime(seconds) }));
		this.right.add_child(duration);
	}
}

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');

export async function tryCreateDirectoryFileInfo(ext: Extension, file: Gio.File): Promise<DirectoryInfo | null> {
	try {
		const enumerator = await file.enumerate_children_async(
			'standard::*',
			Gio.FileQueryInfoFlags.NONE,
			GLib.PRIORITY_DEFAULT,
			null,
		);
		let directoryCount = 0;
		let fileCount = 0;
		for await (const f of enumerator) {
			const fileType = f.get_file_type();
			if (fileType === Gio.FileType.DIRECTORY) {
				directoryCount++;
			} else if (fileType === Gio.FileType.REGULAR) {
				fileCount++;
			}
		}

		return new DirectoryInfo(ext, directoryCount, fileCount);
	} catch {
		return null;
	}
}

export function tryCreateImageInfo(file: Gio.File, size: number): ImageInfo | null {
	try {
		const [, width, height] = GdkPixbuf.Pixbuf.get_file_info(file.get_path()!);
		return new ImageInfo(size, width, height);
	} catch {
		return null;
	}
}

export async function tryCreateMediaFileInfo(
	ext: CopyousExtension,
	file: Gio.File,
	size: number,
	cancellable: Gio.Cancellable,
): Promise<MediaInfo | null> {
	try {
		if (!Gst.is_initialized()) {
			Gst.init(null);
		}

		// https://gitlab.freedesktop.org/gstreamer/gst-plugins-base/-/blob/ce69d1068af058425b083aaa1b8c268b1b2e5ddd/gst-libs/gst/pbutils/gstdiscoverer.c#L340
		const pipeline = Gst.parse_launch(`uridecodebin uri="${file.get_uri()}"`);
		pipeline.set_state(Gst.State.PAUSED);

		// https://gitlab.freedesktop.org/gstreamer/gst-plugins-base/-/blob/ce69d1068af058425b083aaa1b8c268b1b2e5ddd/gst-libs/gst/pbutils/gstdiscoverer.c#L1417
		let [success, duration] = pipeline.query_duration(Gst.Format.TIME);
		if (!success) {
			pipeline.set_state(Gst.State.PLAYING);

			await new Promise<void>((resolve) => {
				let i = 0;
				const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
					[success, duration] = pipeline.query_duration(Gst.Format.TIME);
					if (success || i >= 5) {
						resolve();
						cancellable.disconnect(cancellableId);
						return GLib.SOURCE_REMOVE;
					}

					i++;
					cancellable.disconnect(cancellableId);
					return GLib.SOURCE_CONTINUE;
				});

				const cancellableId = cancellable.connect(() => GLib.source_remove(timeoutId));
			});
		}

		pipeline.set_state(Gst.State.NULL);

		if (success && duration >= 0) {
			return new MediaInfo(ext, size, duration / Gst.SECOND);
		} else {
			return null;
		}
	} catch (err) {
		ext.logger.error(err);
		return null;
	}
}

export async function createFileInfo(
	ext: CopyousExtension,
	file: Gio.File,
	fileType: FileType,
	cancellable: Gio.Cancellable,
): Promise<FileInfo> {
	try {
		if (!file.query_exists(null)) {
			return new MissingFileInfo(ext);
		}

		const info = await file.query_info_async(
			Gio.FILE_ATTRIBUTE_STANDARD_SIZE,
			Gio.FileQueryInfoFlags.NONE,
			GLib.PRIORITY_DEFAULT,
			null,
		);
		const size = info.get_size();

		let fileInfo: FileInfo | null = null;
		switch (fileType) {
			case FileType.Directory:
				fileInfo = await tryCreateDirectoryFileInfo(ext, file);
				break;
			case FileType.Image:
				fileInfo = tryCreateImageInfo(file, size);
				break;
			case FileType.Audio:
			case FileType.Video:
				fileInfo = await tryCreateMediaFileInfo(ext, file, size, cancellable);
				break;
		}

		return fileInfo ?? new FileInfo(size);
	} catch {
		return new ErrorFileInfo(ext);
	}
}
