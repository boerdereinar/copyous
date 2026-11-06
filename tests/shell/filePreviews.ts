import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';

export const METRICS = {
	filePreviewChecks: { description: 'File thumbnail regression checks passed', units: 'checks', value: 0 },
};

function check(condition: boolean, message: string) {
	if (!condition) throw new Error(message);
	METRICS.filePreviewChecks.value++;
}

export async function run() {
	let extension: CopyousExtension | undefined;
	for (let i = 0; i < 50; i++) {
		const info = Main.extensionManager.lookup('copyous@boerdereinar.dev');
		const errors = (info as unknown as { errors?: string[] } | undefined)?.errors;
		if (info?.state === ExtensionState.ERROR && errors?.length) throw new Error(errors.join('\n'));
		if (info?.state === (1 as ExtensionState)) {
			extension = info.stateObj as CopyousExtension;
			break;
		}
		// eslint-disable-next-line no-await-in-loop
		await Scripting.sleep(1000);
	}
	if (!extension) throw new Error('Copyous did not enable');
	const { getFileType, tryCreateFilePreview } = (await import(
		extension.dir.get_child('lib/ui/components/contentPreview.js').get_uri()
	)) as typeof import('../../src/lib/ui/components/contentPreview.js');
	const dir = Gio.File.new_for_path(GLib.dir_make_tmp('copyous-preview-XXXXXX'));
	const file = dir.get_child('document.pdf');
	file.replace_contents(new TextEncoder().encode('%PDF-1.4\n'), null, false, Gio.FileCreateFlags.NONE, null);
	const uri = file.get_uri();
	const mtime = file
		.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null)
		.get_attribute_uint64('time::modified');
	const cache = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_cache_dir(), 'thumbnails', 'normal']));
	cache.make_directory_with_parents(null);
	const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, uri, -1);
	const thumbnail = cache.get_child(`${hash}.png`);
	const pixbuf = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, 64, 96);
	pixbuf.fill(0x3584e4ff);
	pixbuf.savev(thumbnail.get_path()!, 'png', ['tEXt::Thumb::URI', 'tEXt::Thumb::MTime'], [uri, String(mtime)]);
	const settings = extension.settings.get_child('file-item');
	const original = settings.get_value('file-preview-types');
	try {
		settings.set_flags('file-preview-types', 7);
		const [type, found] = await getFileType(file);
		check(found?.equal(thumbnail) === true, 'Use the valid thumbnail from XDG_CACHE_HOME');
		const preview = await tryCreateFilePreview(extension, file, type, found);
		check(
			preview !== null && !preview.has_style_class_name('missing-image'),
			'PDF thumbnail must load as an image',
		);
		const image = preview?.get_first_child() as St.Widget | null;
		check(image?.get_style()?.includes(thumbnail.get_uri()) === true, 'Render the PNG, not the PDF');
		preview?.destroy();
		check(
			(await tryCreateFilePreview(extension, file, type, null)) === null,
			'Files without thumbnails keep the fallback',
		);
		settings.set_flags('file-preview-types', 0);
		check((await tryCreateFilePreview(extension, file, type, found)) === null, 'Respect disabled thumbnails');
		file.set_attribute_uint64('time::modified', mtime + 10, Gio.FileQueryInfoFlags.NONE, null);
		const [, stale] = await getFileType(file);
		check(stale === null, 'Do not display stale thumbnails');
	} finally {
		settings.set_value('file-preview-types', original);
		thumbnail.delete(null);
		file.delete(null);
		dir.delete(null);
	}
	print(`PASS: ${METRICS.filePreviewChecks.value} file preview checks`);
}
