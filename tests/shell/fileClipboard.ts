import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';

Gio._promisify(Meta.Selection.prototype, 'transfer_async');

export const METRICS = {
	fileClipboardChecks: { description: 'File clipboard regression checks passed', units: 'checks', value: 0 },
};

function check(condition: boolean, message: string) {
	if (!condition) throw new Error(message);
	METRICS.fileClipboardChecks.value++;
}

async function waitForExtension(): Promise<CopyousExtension> {
	for (let i = 0; i < 50; i++) {
		const extension = Main.extensionManager.lookup('copyous@boerdereinar.dev');
		if (extension?.state === ExtensionState.ERROR) throw new Error(extension.error);
		if (extension?.state === (1 as ExtensionState)) return extension.stateObj as CopyousExtension;
		// eslint-disable-next-line no-await-in-loop
		await Scripting.sleep(1000);
	}
	throw new Error('Copyous did not enable');
}

export async function run() {
	const extension = await waitForExtension();
	const manager = extension.clipboardManager!;
	const { ClipboardEntry, FileOperation } = (await import(
		extension.dir.get_child('lib/database/database.js').get_uri()
	)) as typeof import('../../src/lib/database/database.js');
	const selection = global.display.get_selection();
	const selectionType = Meta.SelectionType.SELECTION_CLIPBOARD;
	const paths = ['file:///tmp/Relat%C3%B3rio%20final.pdf', 'file:///tmp/planilha%23%25.ods'];

	for (const [type, uris, operation] of [
		['File', paths.slice(0, 1), FileOperation.Copy],
		['Files', paths, FileOperation.Copy],
		['File', paths.slice(1), FileOperation.Cut],
	] as const) {
		const entry = new ClipboardEntry(1000, type, uris.join('\n'), false, null, GLib.DateTime.new_now_utc(), {
			operation,
		});
		manager.copyText('Something copied after the file');
		// eslint-disable-next-line no-await-in-loop
		await manager.copyEntry(entry);
		const types = selection.get_mimetypes(selectionType);
		check(types.includes('text/uri-list'), 'Restored files must offer text/uri-list');
		const out = Gio.MemoryOutputStream.new_resizable();
		// eslint-disable-next-line no-await-in-loop
		await selection.transfer_async(selectionType, 'text/uri-list', -1, out, null);
		out.close(null);
		const data = new TextDecoder().decode(out.steal_as_bytes().toArray());
		check(data === `${uris.join('\r\n')}\r\n`, 'URI list must preserve escaping and use CRLF');
		check(!data.startsWith('cut') && !data.startsWith('copy'), 'History must restore files as copies');
	}
	print(`PASS: ${METRICS.fileClipboardChecks.value} file clipboard checks`);
}
