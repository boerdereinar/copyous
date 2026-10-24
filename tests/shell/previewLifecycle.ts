import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};

export async function run() {
	let extension;
	for (let i = 0; i < 100; i++) {
		extension = Main.extensionManager.lookup('copyous@boerdereinar.dev');
		if (extension?.state === 1) break;
		await Scripting.sleep(100);
	}
	if (extension?.state !== 1) throw new Error('Extension must be enabled');
	const ext = extension.stateObj;
	const uri = extension.dir.get_uri();
	const { LinkItem, LinkPreview } = await import(`${uri}/lib/ui/items/linkItem.js`);
	const { FileItem } = await import(`${uri}/lib/ui/items/fileItem.js`);
	const { ClipboardEntry } = await import(`${uri}/lib/database/database.js`);
	const { tryCreateMediaFileInfo } = await import(`${uri}/lib/ui/components/contentInfo.js`);
	const { ImagePreview } = await import(`${uri}/lib/ui/components/contentPreview.js`);
	const { tryGetLinkImage } = await import(`${uri}/lib/misc/link.js`);
	const { ItemType } = await import(`${uri}/lib/common/constants.js`);
	const server = new Soup.Server();
	server.add_handler('/image', (_server, message) => {
		message.set_status(200, null);
		message.set_response(
			'image/svg+xml',
			Soup.MemoryUse.COPY,
			'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><path fill="red" d="M0 0h8v8H0z"/></svg>',
		);
	});
	server.add_handler(null, (_server, message) => {
		message.set_status(200, null);
		message.set_response('text/html', Soup.MemoryUse.COPY, '<title>Delayed metadata</title>');
		let finished = false;
		message.connect('finished', () => {
			finished = true;
		});
		message.pause();
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
			if (!finished) message.unpause();
			return GLib.SOURCE_REMOVE;
		});
	});
	server.listen_local(0, Soup.ServerListenOptions.IPV4_ONLY);
	const url = server.get_uris()[0]!.to_string();
	try {
		const image = await tryGetLinkImage(ext, url + 'image', new Gio.Cancellable());
		if (!image?.query_exists(null)) throw new Error('Actual Soup link image download must complete and be cached');
		const preview = new LinkPreview(ext, url);
		preview.metadata = { title: 'Test', description: null, image: url + 'image' };
		preview.showImage = true;
		preview.showImage = false;
		await Scripting.sleep(100);
		if (preview.get_children().some((child: St.Widget) => child instanceof ImagePreview && child.visible))
			throw new Error('Late image must not override disabled preview');
		preview.destroy();
		const entry = new ClipboardEntry(1, ItemType.Link, url, false, null, GLib.DateTime.new_now_utc());
		const parent = new St.Widget();
		parent.add_child(new LinkItem(ext, entry));
		await Scripting.sleep(50);
		parent.destroy();
		await Scripting.sleep(300);
		if (entry.metadata !== null) throw new Error('Destroyed link card must not publish late metadata');
	} finally {
		server.disconnect();
	}

	const directory = Gio.File.new_for_path(GLib.dir_make_tmp('copyous-preview-test-XXXXXX'));
	const file = directory.get_child('test.wav');
	// One second of silent 8-bit PCM, with a real WAV header.
	const wav = new Uint8Array(8044).fill(128);
	const view = new DataView(wav.buffer);
	const text = (offset: number, value: string) => wav.set(new TextEncoder().encode(value), offset);
	text(0, 'RIFF');
	view.setUint32(4, 8036, true);
	text(8, 'WAVEfmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, 8000, true);
	view.setUint32(28, 8000, true);
	view.setUint16(32, 1, true);
	view.setUint16(34, 8, true);
	text(36, 'data');
	view.setUint32(40, 8000, true);
	file.replace_contents(wav, null, false, Gio.FileCreateFlags.NONE, null);
	try {
		const info = await tryCreateMediaFileInfo(ext, file, wav.length, new Gio.Cancellable());
		if (!info) throw new Error('Real GStreamer duration discovery must succeed');
		info.destroy();
		const cancelled = new Gio.Cancellable();
		cancelled.cancel();
		if (await tryCreateMediaFileInfo(ext, file, wav.length, cancelled))
			throw new Error('Cancelled discovery must not create info');
		const pending = new Gio.Cancellable();
		const work = tryCreateMediaFileInfo(ext, file, wav.length, pending);
		pending.cancel();
		const late = await work;
		if (late) late.destroy();
		const parent = new St.Widget();
		parent.add_child(
			new FileItem(
				ext,
				new ClipboardEntry(2, ItemType.File, file.get_uri(), false, null, GLib.DateTime.new_now_utc()),
			),
		);
		parent.destroy();
		await Scripting.sleep(350);
	} finally {
		file.delete(null);
		directory.delete(null);
	}
	console.log('Copyous native preview cancellation and media discovery checks passed');
}
