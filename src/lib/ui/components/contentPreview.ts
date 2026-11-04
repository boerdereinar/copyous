import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { ActiveState, getCachePath } from '../../common/constants.js';
import { enumParamSpec, flagsParamSpec, registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';
import { BackgroundSize, FilePreviewType } from '../../common/settings.js';
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

/**
 * Images up to this size are passed to St as a background-image directly. Anything larger gets a cached
 * downscaled copy, since St crashes gnome-shell when the texture cache fails to load an image (e.g. one that
 * exceeds GL_MAX_TEXTURE_SIZE, usually 16384px), and since the rounded image box is redrawn with cairo at the
 * source resolution on every style change (~30ms for a 2516px wide screenshot vs ~2ms downscaled).
 */
const PREVIEW_MAX_WIDTH = 768;
const PREVIEW_MAX_HEIGHT = 4096;

/**
 * Gets the size of an image. PNG sizes are read from the header directly, since GdkPixbuf.get_file_info can go
 * through a sandboxed glycin loader, which takes 100-150ms for a large screenshot.
 * @param image The image
 * @returns The width and height of the image
 */
function getImageSize(image: Gio.File): [number, number] {
	try {
		const stream = image.read(null);
		const header = stream.read_bytes(24, null).toArray();
		stream.close(null);

		const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		const ihdr = String.fromCharCode(...header.slice(12, 16));
		if (header.length === 24 && signature.every((b, i) => header[i] === b) && ihdr === 'IHDR') {
			const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
			const width = view.getUint32(16);
			const height = view.getUint32(20);
			if (width > 0 && height > 0) return [width, height];
		}
	} catch {
		// Fall back to GdkPixbuf
	}

	const [format, width, height] = GdkPixbuf.Pixbuf.get_file_info(image.get_path()!);
	if (format === null) throw new Error('Unknown image format');
	return [width, height];
}

/**
 * Gets the file to use as a preview background-image
 * @param ext The extension
 * @param image The original image
 * @param width The width of the original image
 * @param height The height of the original image
 * @returns The original image if it is small enough, otherwise the cached downscaled copy, and whether it exists
 */
function getPreviewFile(ext: Extension, image: Gio.File, width: number, height: number): [Gio.File, boolean] {
	if (width <= PREVIEW_MAX_WIDTH && height <= PREVIEW_MAX_HEIGHT) return [image, true];

	const uri = image.get_uri();
	const key = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, uri, uri.length);
	const preview = getCachePath(ext).get_child('previews').get_child(`${key}-w${PREVIEW_MAX_WIDTH}.png`);
	return [preview, preview.query_exists(null)];
}

/**
 * Creates a downscaled copy of an image. Decoding and encoding run in worker threads, since a large
 * screenshot would block the shell for several hundred milliseconds.
 * @param image The original image
 * @param preview The file to save the downscaled copy to
 * @param width The width of the original image
 * @param height The height of the original image
 * @param cancellable The cancellable
 */
async function createPreviewFile(
	image: Gio.File,
	preview: Gio.File,
	width: number,
	height: number,
	cancellable: Gio.Cancellable,
): Promise<void> {
	const previewDir = preview.get_parent()!;
	if (!previewDir.query_exists(null)) previewDir.make_directory_with_parents(null);

	// Scale to the maximum width, keeping the aspect ratio unless the image is extremely tall
	const scale = Math.min(PREVIEW_MAX_WIDTH / width, PREVIEW_MAX_HEIGHT / height);
	const input = await image.read_async(GLib.PRIORITY_DEFAULT, cancellable);
	const pixbuf = await new Promise<GdkPixbuf.Pixbuf>((resolve, reject: (reason: Error) => void) => {
		GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
			input,
			Math.max(1, Math.round(width * scale)),
			Math.max(1, Math.round(height * scale)),
			false,
			cancellable,
			(_source, result) => {
				try {
					resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(result));
				} catch (error) {
					reject(error as Error);
				}
			},
		);
	}).finally(() => input.close(null));

	// replace() writes to a temporary file that is renamed on close, so a partial preview is never used
	const output = await preview.replace_async(
		null,
		false,
		Gio.FileCreateFlags.REPLACE_DESTINATION,
		GLib.PRIORITY_DEFAULT,
		cancellable,
	);
	await new Promise<void>((resolve, reject: (reason: Error) => void) => {
		pixbuf.save_to_streamv_async(output, 'png', ['compression'], ['1'], cancellable, (_source, result) => {
			try {
				GdkPixbuf.Pixbuf.save_to_stream_finish(result);
				resolve();
			} catch (error) {
				reject(error as Error);
			}
		});
	});
	await output.close_async(GLib.PRIORITY_DEFAULT, null);
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
	private readonly _cancellable: Gio.Cancellable = new Gio.Cancellable();

	constructor(ext: CopyousExtension, image: Gio.File) {
		super();

		this.add_style_class_name('image-preview');

		if (image.query_exists(null)) {
			try {
				const [width, height] = getImageSize(image);
				this._ratio = height / width;

				const [previewFile, exists] = getPreviewFile(ext, image, width, height);
				const imageBox = new St.Widget({
					style_class: 'image-box',
					x_align: Clutter.ActorAlign.FILL,
					y_align: Clutter.ActorAlign.FILL,
					x_expand: true,
					y_expand: true,
				});
				const setImage = () => (imageBox.style = `background-image: url("${previewFile.get_uri()}");`);
				if (exists) {
					setImage();
				} else {
					createPreviewFile(image, previewFile, width, height, this._cancellable)
						.then(() => {
							if (!this._cancellable.is_cancelled()) setImage();
						})
						.catch((error: unknown) => {
							if (!this._cancellable.is_cancelled()) ext.logger.error(error);
						});
				}
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

	override destroy() {
		this._cancellable.cancel();
		super.destroy();
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

		this.bind_property('syntax-highlighting', label, 'syntax-highlighting', GObject.BindingFlags.DEFAULT);
		this.bind_property('show-line-numbers', label, 'show-line-numbers', GObject.BindingFlags.DEFAULT);
		this.bind_property('tab-width', label, 'tab-width', GObject.BindingFlags.DEFAULT);
	}
}

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.File.prototype, 'read_async');
Gio._promisify(Gio.File.prototype, 'replace_async');
Gio._promisify(Gio.OutputStream.prototype, 'close_async');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');

/**
 * Creates a text preview by reading the first 4096 bytes
 * @returns The text preview
 */
async function createTextPreview(
	ext: CopyousExtension,
	file: Gio.File,
	cancellable: Gio.Cancellable | null,
): Promise<TextPreview> {
	const extension = file.get_uri().match(/\.(\w+)$/)?.[1];

	let stream: Gio.FileInputStream = null!;
	try {
		stream = await file.read_async(GLib.PRIORITY_DEFAULT, cancellable);
		const bytes = await stream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, cancellable);
		const text = new TextDecoder().decode(bytes.toArray());
		return new TextPreview(ext, text, extension);
	} finally {
		stream.close(null);
	}
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

	let data: GLib.Bytes;
	try {
		const stream = await file.read_async(GLib.PRIORITY_DEFAULT, null);
		data = await stream.read_bytes_async(64, GLib.PRIORITY_DEFAULT, null);
	} catch {
		return null;
	}

	return Gio.content_type_guess(file.get_path(), data.toArray())[0];
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
 * @param cancellable The cancellable
 * @returns the created file preview or null if either the file preview could not be created or if it is not allowed
 */
export async function tryCreateFilePreview(
	ext: CopyousExtension,
	file: Gio.File,
	fileType: FileType,
	thumbnail: Gio.File | null,
	cancellable: Gio.Cancellable | null = null,
): Promise<ContentPreview | null> {
	if (cancellable?.is_cancelled()) return null;
	const allowedTypes = ext.settings.get_child('file-item').get_flags('file-preview-types');

	try {
		if (!file.query_exists(null)) return null;

		switch (fileType) {
			case FileType.Text:
				return allowedTypes & FilePreviewType.Text ? await createTextPreview(ext, file, cancellable) : null;
			case FileType.Image:
				return allowedTypes & FilePreviewType.Image ? new ImagePreview(ext, file) : null;
		}

		return thumbnail && allowedTypes & FilePreviewType.Thumbnail ? new ThumbnailPreview(ext, file) : null;
	} catch (error) {
		if (!cancellable?.is_cancelled()) ext.logger.error(error);
		return null;
	}
}
