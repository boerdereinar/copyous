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
import { QueuedWork } from '../../misc/workQueue.js';
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

	public prioritizePreviews(): void {
		for (const child of this.get_children()) {
			const preview = child as Clutter.Actor & { prioritizePreviews?: () => void };
			preview.prioritizePreviews?.();
		}
	}

	public deprioritizePreviews(): void {
		for (const child of this.get_children()) {
			const preview = child as Clutter.Actor & { deprioritizePreviews?: () => void };
			preview.deprioritizePreviews?.();
		}
	}
}

/**
 * Largest image edge that is passed to St as a background-image directly.
 * Anything larger gets a cached downscaled copy, since St crashes gnome-shell
 * when the texture cache fails to load an image (e.g. one that exceeds
 * GL_MAX_TEXTURE_SIZE, usually 16384px).
 */
const MAX_PREVIEW_EDGE = 4096;
const PREVIEW_TARGET_EDGE = 1024;

async function ensureDirectory(directory: Gio.File, cancellable: Gio.Cancellable): Promise<void> {
	try {
		await directory.make_directory_async(GLib.PRIORITY_DEFAULT, cancellable);
	} catch (error) {
		if (error instanceof GLib.Error && error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.EXISTS)) return;
		if (!(error instanceof GLib.Error) || !error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
			throw error;
		const parent = directory.get_parent();
		if (!parent) throw error;
		await ensureDirectory(parent, cancellable);
		await ensureDirectory(directory, cancellable);
	}
}

function getScaledPreviewFile(ext: Extension, image: Gio.File): Gio.File {
	const uri = image.get_uri();
	const key = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, uri, uri.length);
	return getCachePath(ext).get_child('previews').get_child(`${key}.png`);
}

/**
 * Gets a file that is safe to use as a preview background-image
 * @param ext The extension
 * @param image The original image
 * @param width The width of the original image
 * @param height The height of the original image
 * @returns The original image if it is small enough, otherwise a cached downscaled copy
 */
async function getSafePreviewFile(
	ext: Extension,
	image: Gio.File,
	width: number,
	height: number,
	cancellable: Gio.Cancellable,
): Promise<Gio.File> {
	if (width <= MAX_PREVIEW_EDGE && height <= MAX_PREVIEW_EDGE) return image;
	const preview = getScaledPreviewFile(ext, image);
	const previewDir = preview.get_parent()!;
	if (await fileExists(preview, cancellable)) return preview;

	const input = await image.read_async(GLib.PRIORITY_DEFAULT, cancellable);
	let pixbuf: GdkPixbuf.Pixbuf;
	try {
		pixbuf = await new Promise<GdkPixbuf.Pixbuf>((resolve, reject) => {
			GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
				input,
				PREVIEW_TARGET_EDGE,
				PREVIEW_TARGET_EDGE,
				true,
				cancellable,
				(_source, result) => {
					try {
						resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(result));
					} catch (error) {
						reject(error instanceof Error ? error : new Error(String(error)));
					}
				},
			);
		});
	} finally {
		await input.close_async(GLib.PRIORITY_DEFAULT, null);
	}
	const output = Gio.MemoryOutputStream.new_resizable();
	try {
		await new Promise<void>((resolve, reject) => {
			pixbuf.save_to_streamv_async(output, 'png', [], [], cancellable, (_source, result) => {
				try {
					if (!GdkPixbuf.Pixbuf.save_to_stream_finish(result)) throw new Error('Failed to save preview');
					resolve();
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			});
		});
	} finally {
		await output.close_async(GLib.PRIORITY_DEFAULT, null);
	}
	const data = output.steal_as_bytes().get_data();
	if (!data) throw new Error('Empty preview');
	await ensureDirectory(previewDir, cancellable);
	// Publish only a completely encoded PNG, including when cancellation interrupts encoding.
	await preview.replace_contents_async(data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, cancellable);
	return preview;
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
	private _ratio: number | null = null;
	private _loading: QueuedWork<Gio.File> | null = null;
	private readonly _cancellable = new Gio.Cancellable();
	private _effect: Clutter.BrightnessContrastEffect | undefined;

	constructor(ext: CopyousExtension, image: Gio.File) {
		super();
		this.connect('destroy', () => {
			this._cancellable.cancel();
			this._loading?.cancel();
		});
		this.add_style_class_name('image-preview');
		try {
			// Preserve the original aspect ratio from the header before layout.
			// Full image decoding, scaling and PNG encoding run asynchronously.
			const [format, width, height] = GdkPixbuf.Pixbuf.get_file_info(image.get_path()!);
			if (!format || width <= 0 || height <= 0) throw new Error('Invalid image');
			this._ratio = height / width;
			const imageBox = new St.Widget({
				style_class: 'image-box',
				x_align: Clutter.ActorAlign.FILL,
				y_align: Clutter.ActorAlign.FILL,
				x_expand: true,
				y_expand: true,
			});
			this.add_child(imageBox);
			this._effect = new Clutter.BrightnessContrastEffect();
			imageBox.add_effect(this._effect);
			if (width <= MAX_PREVIEW_EDGE && height <= MAX_PREVIEW_EDGE) {
				imageBox.set_style(`background-image: url("${image.get_uri()}");`);
			} else if (getScaledPreviewFile(ext, image).query_exists(null)) {
				// Keep cached images immediately available when opening the dialog.
				imageBox.set_style(`background-image: url("${getScaledPreviewFile(ext, image).get_uri()}");`);
			} else {
				this._loading = ext.previewQueue.add(() =>
					getSafePreviewFile(ext, image, width, height, this._cancellable),
				);
				void this._loading.promise
					.then((preview) => {
						if (preview && !this._cancellable.is_cancelled())
							imageBox.set_style(`background-image: url("${preview.get_uri()}");`);
					})
					.catch(() => {
						if (!this._cancellable.is_cancelled()) {
							imageBox.destroy();
							this.showMissingImage(ext);
						}
					})
					.finally(() => {
						this._loading = null;
					});
			}
		} catch {
			this.showMissingImage(ext);
		}
	}

	private showMissingImage(ext: Extension): void {
		this._effect = undefined;
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

	public override deprioritizePreviews(): void {
		this._loading?.demote();
	}

	public override prioritizePreviews(): void {
		this._loading?.promote();
	}

	override destroy(): void {
		this._cancellable.cancel();
		this._loading?.cancel();
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

		const settings = ext.settings.get_child('file-item');
		const props: Partial<CodeLabelConstructorProps> = {
			code: text,
			syntaxHighlighting: settings.get_boolean('syntax-highlighting'),
			showLineNumbers: settings.get_boolean('show-line-numbers'),
			tabWidth: ext.settings.get_int('tab-width'),
		};
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
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'make_directory_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.OutputStream.prototype, 'close_async');
Gio._promisify(Gio.InputStream.prototype, 'close_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');

export async function fileExists(file: Gio.File, cancellable: Gio.Cancellable | null = null): Promise<boolean> {
	try {
		await file.query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
		return true;
	} catch {
		return false;
	}
}

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
	const stream = await file.read_async(GLib.PRIORITY_DEFAULT, cancellable);
	let bytes: GLib.Bytes;
	try {
		bytes = await stream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, cancellable);
	} finally {
		await stream.close_async(GLib.PRIORITY_DEFAULT, null);
	}
	if (cancellable?.is_cancelled()) throw new Error('Preview cancelled');
	return new TextPreview(ext, new TextDecoder().decode(bytes.toArray()), extension);
}

/**
 * Gets the thumbnail for a file
 * @param file The file to get the thumbnail for
 * @returns The thumbnail or null if no thumbnail was found
 */
// Share only in-flight listings: later requests must see newly created directories.
let thumbnailDirectoriesPromise: Promise<Gio.File[]> | null = null;

async function getThumbnailDirectories(): Promise<Gio.File[]> {
	if (thumbnailDirectoriesPromise) return thumbnailDirectoriesPromise;
	thumbnailDirectoriesPromise = (async () => {
		const root = Gio.File.new_build_filenamev([GLib.get_home_dir(), '.cache', 'thumbnails']);
		const enumerator = await root.enumerate_children_async(
			'standard::name,standard::type',
			Gio.FileQueryInfoFlags.NONE,
			GLib.PRIORITY_DEFAULT,
			null,
		);
		const directories: Gio.File[] = [];
		try {
			for await (const info of enumerator) {
				if (info.get_file_type() === Gio.FileType.DIRECTORY) directories.push(root.get_child(info.get_name()));
			}
		} finally {
			if (!enumerator.is_closed()) await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
		}
		return directories;
	})()
		.catch(() => [])
		.finally(() => {
			thumbnailDirectoriesPromise = null;
		});
	return thumbnailDirectoriesPromise;
}

async function tryGetThumbnail(file: Gio.File, cancellable: Gio.Cancellable | null): Promise<Gio.File | null> {
	const uri = file.get_uri();
	const md5 = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, uri, uri.length);
	for (const directory of await getThumbnailDirectories()) {
		const thumbnail = directory.get_child(`${md5}.png`);
		if (cancellable?.is_cancelled()) return null;
		// Preserve directory precedence without starting unnecessary file queries.
		// eslint-disable-next-line no-await-in-loop
		if (await fileExists(thumbnail, cancellable)) return thumbnail;
	}
	return null;
}

/**
 * Gets the content type of a file
 * @param file The file to guess the content type of
 * @returns The content type or null if no content type was found
 */
async function getContentType(
	file: Gio.File,
	info: Gio.FileInfo,
	cancellable: Gio.Cancellable | null,
): Promise<string | null> {
	const contentType = info.get_content_type();
	if (contentType !== null) return contentType;

	let data: GLib.Bytes;
	try {
		const stream = await file.read_async(GLib.PRIORITY_DEFAULT, cancellable);
		try {
			data = await stream.read_bytes_async(64, GLib.PRIORITY_DEFAULT, cancellable);
		} finally {
			await stream.close_async(GLib.PRIORITY_DEFAULT, null);
		}
	} catch {
		return null;
	}

	return Gio.content_type_guess(file.get_path(), data.toArray())[0];
}

/**
 * Gets the file type for a file
 * @param file The file to find the file type for
 * @param fetchThumbnail Whether to look up a cached thumbnail (skip when
 * thumbnails can never be displayed to avoid enumerating ~/.cache/thumbnails)
 * @returns The file type and a Gio.File if a thumbnail was found for the file
 */
export async function getFileType(
	file: Gio.File,
	fetchThumbnail: boolean = true,
	cancellable: Gio.Cancellable | null = null,
): Promise<[FileType, Gio.File | null]> {
	let info: Gio.FileInfo;
	try {
		info = await file.query_info_async(
			'standard::type,standard::content-type',
			Gio.FileQueryInfoFlags.NONE,
			GLib.PRIORITY_DEFAULT,
			cancellable,
		);
	} catch {
		return [FileType.Unknown, null];
	}
	const fileType = info.get_file_type();
	if (fileType === Gio.FileType.DIRECTORY) return [FileType.Directory, null];

	if (fileType !== Gio.FileType.REGULAR) return [FileType.Unknown, null];

	// Text and image previews do not use the thumbnail. Skip scanning the
	// thumbnail cache for these common file types.
	const contentType = await getContentType(file, info, cancellable);
	if (contentType) {
		// Image takes precedence because SVG can also be considered text.
		if (Gio.content_type_is_a(contentType, 'image/*')) return [FileType.Image, null];
		if (Gio.content_type_is_a(contentType, 'text/plain')) return [FileType.Text, null];
	}

	const thumbnail = fetchThumbnail ? await tryGetThumbnail(file, cancellable) : null;
	if (contentType) {
		if (Gio.content_type_is_a(contentType, 'audio/*')) return [FileType.Audio, thumbnail];
		if (Gio.content_type_is_a(contentType, 'video/*')) return [FileType.Video, thumbnail];
	}
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
	cancellable: Gio.Cancellable | null = null,
): Promise<ContentPreview | null> {
	const allowedTypes = ext.settings.get_child('file-item').get_flags('file-preview-types');

	try {
		if (!(await fileExists(file, cancellable)) || cancellable?.is_cancelled()) return null;

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
