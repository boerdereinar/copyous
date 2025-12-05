import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { ActiveState } from '../../common/constants.js';
import { enumParamSpec, flagsParamSpec, registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';
import { CodeLabel, CodeLabelConstructorProps } from './codeLabel.js';

export const FileType = {
	Unknown: 'Unknown',
	Directory: 'Directory',
	Text: 'Text',
	Image: 'Image',
	Audio: 'Audio',
	Video: 'Video',
} as const;

export type FileType = (typeof FileType)[keyof typeof FileType];

export const FilePreviewType = {
	None: 0,
	Text: 1,
	Image: 2,
	Thumbnail: 4,
	All: 7,
} as const;

export type FilePreviewType = (typeof FilePreviewType)[keyof typeof FilePreviewType];

export const BackgroundSize = {
	Cover: 0,
	Contain: 1,
} as const;

export type BackgroundSize = (typeof BackgroundSize)[keyof typeof BackgroundSize];

@registerClass()
export class ContentPreview extends St.BoxLayout {
	constructor() {
		super({
			style_class: 'content-preview',
			orientation: Clutter.Orientation.VERTICAL,
			x_expand: true,
			y_expand: true,
		});
	}
}

@registerClass({
	Properties: {
		'background-size': enumParamSpec(
			'background-size',
			GObject.ParamFlags.READWRITE,
			BackgroundSize,
			BackgroundSize.Cover,
		),
		'active': flagsParamSpec('active', GObject.ParamFlags.WRITABLE, ActiveState, ActiveState.None),
	},
})
export class ImagePreview extends ContentPreview {
	private _backgroundSize: BackgroundSize = BackgroundSize.Cover;
	private readonly _ratio: number | null;
	private readonly _effect?: Clutter.BrightnessContrastEffect;

	constructor(ext: Extension, image: Gio.File) {
		super();

		this.add_style_class_name('image-preview');

		if (image.query_exists(null)) {
			try {
				const [, width, height] = GdkPixbuf.Pixbuf.get_file_info(image.get_path()!);
				this._ratio = height / width;

				const imageBox = new St.Widget({
					style_class: 'image-box',
					x_align: Clutter.ActorAlign.FILL,
					y_align: Clutter.ActorAlign.FILL,
					x_expand: true,
					y_expand: true,
					style: `background-image: url("${image.get_uri()}");`,
				});
				this.add_child(imageBox);

				this._effect = new Clutter.BrightnessContrastEffect();
				imageBox.add_effect(this._effect);
				return;
			} catch {
				// Ignore
			}
		}

		this._ratio = null;
		this.add_style_class_name('missing-image');
		this.add_child(
			new St.Icon({
				gicon: loadIcon(ext, Icon.MissingImage),
				x_align: Clutter.ActorAlign.CENTER,
				y_align: Clutter.ActorAlign.CENTER,
				x_expand: true,
				y_expand: true,
				min_height: 0,
			}),
		);
	}

	get backgroundSize() {
		return this._backgroundSize;
	}

	set backgroundSize(backgroundSize: BackgroundSize) {
		this._backgroundSize = backgroundSize;
		this.notify('background-size');

		if (backgroundSize === BackgroundSize.Cover) {
			this.remove_style_class_name('contain');
		} else {
			this.add_style_class_name('contain');
		}
	}

	set active(active: ActiveState) {
		if (!this._effect) return;

		if ((active & ActiveState.Active) > 0) {
			this._effect.set_brightness(0.2);
		} else if ((active & ActiveState.FocusHover) === (ActiveState.FocusHover as number)) {
			this._effect.set_brightness(0.1);
		} else if (active & ActiveState.Focus || active & ActiveState.Hover) {
			this._effect.set_brightness(0.05);
		} else {
			this._effect.enabled = false;
			return;
		}

		this._effect.enabled = true;
	}

	override vfunc_get_preferred_height(for_width: number): [number, number] {
		if (this._ratio === null) return super.vfunc_get_preferred_height(for_width);

		const [min] = super.vfunc_get_preferred_height(for_width);
		return [min, Math.round(for_width * Math.clamp(this._ratio, 0.3, 1))];
	}
}

@registerClass()
export class ThumbnailPreview extends ImagePreview {}

@registerClass({
	Properties: {
		'syntax-highlighting': GObject.ParamSpec.boolean(
			'syntax-highlighting',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			true,
		),
		'show-line-numbers': GObject.ParamSpec.boolean(
			'show-line-numbers',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			true,
		),
		'tab-width': GObject.ParamSpec.int('tab-width', null, null, GObject.ParamFlags.READWRITE, 1, 8, 4),
	},
})
export class TextPreview extends ContentPreview {
	declare syntaxHighlighting: boolean;
	declare showLineNumbers: boolean;
	declare tabWidth: number;

	constructor(ext: CopyousExtension, text: string, language?: string) {
		super();

		this.add_style_class_name('text-preview');

		const props: Partial<CodeLabelConstructorProps> = { code: text };
		if (language) props.language = { id: language, name: language };
		const label = new CodeLabel(ext, props);
		this.add_child(label);

		this.bind_property('syntax-highlighting', label, 'syntax-highlighting', null);
		this.bind_property('show-line-numbers', label, 'show-line-numbers', null);
		this.bind_property('tab-width', label, 'tab-width', null);
	}
}

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.File.prototype, 'read_async');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');

/**
 * Creates a text preview by reading the first 4096 bytes
 * @returns The text preview
 */
async function createTextPreview(ext: CopyousExtension, file: Gio.File): Promise<TextPreview> {
	const extension = file.get_uri().match(/\.(\w+)$/)?.[1];
	const stream = await file.read_async(GLib.PRIORITY_DEFAULT, null);
	const bytes = await stream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null);
	const text = new TextDecoder().decode(bytes.toArray());
	return new TextPreview(ext, text, extension);
}

/**
 * Gets the thumbnail for a file
 * @param file The file to get the thumbnail for
 * @returns The thumbnail or null if no thumbnail was found
 */
async function tryGetThumbnail(file: Gio.File): Promise<Gio.File | null> {
	const uri = file.get_uri();
	const md5 = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, uri, uri.length);

	const homeDir = GLib.get_home_dir();
	const thumbnailDir = Gio.File.new_build_filenamev([homeDir, '.cache', 'thumbnails']);

	try {
		const enumerator = await thumbnailDir.enumerate_children_async(
			'standard::*',
			Gio.FileQueryInfoFlags.NONE,
			GLib.PRIORITY_DEFAULT,
			null,
		);
		for await (const f of enumerator) {
			if (f.get_file_type() !== Gio.FileType.DIRECTORY) continue;

			const thumbnailFile = thumbnailDir.get_child(f.get_name()).get_child(`${md5}.png`);
			if (thumbnailFile.query_exists(null)) {
				return thumbnailFile;
			}
		}
	} catch {
		return null;
	}

	return null;
}

/**
 * Gets the content type of a file
 * @param file The file to guess the content type of
 * @returns The content type or null if no content type was found
 */
async function getContentType(file: Gio.File): Promise<string | null> {
	const info = await file.query_info_async(
		'standard::content-type',
		Gio.FileQueryInfoFlags.NONE,
		GLib.PRIORITY_DEFAULT,
		null,
	);
	const contentType = info.get_content_type();
	if (contentType !== null) {
		return contentType;
	}

	let data: GLib.Bytes | null = null;
	try {
		const stream = await file.read_async(GLib.PRIORITY_DEFAULT, null);
		data = await stream.read_bytes_async(64, GLib.PRIORITY_DEFAULT, null);
	} catch {
		return null;
	}

	return Gio.content_type_guess(file.get_path(), data?.toArray())[0];
}

/**
 * Gets the file type for a file
 * @param file The file to find the file type for
 * @returns The file type and a Gio.File if a thumbnail was found for the file
 */
export async function getFileType(file: Gio.File): Promise<[FileType, Gio.File | null]> {
	if (!file.query_exists(null)) return [FileType.Unknown, null];

	const fileType = file.query_file_type(Gio.FileQueryInfoFlags.NONE, null);
	if (fileType === Gio.FileType.DIRECTORY) return [FileType.Directory, null];

	if (fileType !== Gio.FileType.REGULAR) return [FileType.Unknown, null];

	// First check if the file has thumbnail
	const thumbnail = await tryGetThumbnail(file);

	// Then check if the file has any of the allowed types
	const contentType = await getContentType(file);
	if (!contentType) return [FileType.Unknown, thumbnail];

	// Check image before text since svg is also classified as text/plain
	if (Gio.content_type_is_a(contentType, 'image/*')) return [FileType.Image, thumbnail];
	if (Gio.content_type_is_a(contentType, 'audio/*')) return [FileType.Audio, thumbnail];
	if (Gio.content_type_is_a(contentType, 'video/*')) return [FileType.Video, thumbnail];
	if (Gio.content_type_is_a(contentType, 'text/plain')) return [FileType.Text, thumbnail];

	return [FileType.Unknown, thumbnail];
}

/**
 * Try to create a file preview for a file type
 * @param ext The extension
 * @param file The file to create a preview for
 * @param fileType The type of the file
 * @param thumbnail The thumbnail of the file if it exists
 * @returns the created file preview or null if either the file preview could not be created or if it is not allowed
 */
export async function tryCreateFilePreview(
	ext: CopyousExtension,
	file: Gio.File,
	fileType: FileType,
	thumbnail: Gio.File | null,
): Promise<ContentPreview | null> {
	const allowedTypes = ext.settings.get_child('file-item').get_flags('file-preview-types');

	try {
		if (!file.query_exists(null)) return null;

		switch (fileType) {
			case FileType.Text:
				return allowedTypes & FilePreviewType.Text ? await createTextPreview(ext, file) : null;
			case FileType.Image:
				return allowedTypes & FilePreviewType.Image ? new ImagePreview(ext, file) : null;
		}

		return thumbnail && allowedTypes & FilePreviewType.Thumbnail ? new ThumbnailPreview(ext, file) : null;
	} catch (error) {
		ext.logger.error(error);
		return null;
	}
}
