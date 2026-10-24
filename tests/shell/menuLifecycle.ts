import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type { ClipboardItem } from '../../src/lib/ui/items/clipboardItem.js';

export const METRICS = {};

export async function run() {
	let extension;
	for (let i = 0; i < 100; i++) {
		extension = Main.extensionManager.lookup('copyous@boerdereinar.dev');
		if (extension?.state === 1) break;
		await Scripting.sleep(100);
	}
	if (extension?.state !== 1) throw new Error('Extension must be enabled');
	const { ClipboardDialog } = await import(`${extension.dir.get_uri()}/lib/ui/clipboardDialog.js`);
	const before = new Set(Main.uiGroup.get_children());
	for (const native of [false, true, false, true]) {
		const dialog = new ClipboardDialog(extension.stateObj);
		const menus = Main.uiGroup.get_children().filter((actor) => !before.has(actor));
		if (menus.length !== 2) throw new Error(`Expected two owned popup actors, found ${menus.length}`);
		let destroyed = 0;
		for (const menu of menus) menu.connect('destroy', () => destroyed++);
		if (native) {
			// Native recursive destruction skips the child's JavaScript destroy override.
			const parent = new St.Widget();
			dialog.get_parent().remove_child(dialog);
			parent.add_child(dialog);
			parent.destroy();
		} else {
			dialog.destroy();
		}
		if (destroyed !== 2) throw new Error(`Popup actors outlived their owner: ${destroyed}/2 destroyed`);
		if (Main.uiGroup.get_children().some((actor) => !before.has(actor)))
			throw new Error('Popup actors leaked into the shell stage');
	}
	const uri = extension.dir.get_uri();
	const { ClipboardEntry } = await import(`${uri}/lib/database/database.js`);
	const { ClipboardItem: Item } = await import(`${uri}/lib/ui/items/clipboardItem.js`);
	const { ItemType } = await import(`${uri}/lib/common/constants.js`);
	const dialog = new ClipboardDialog(extension.stateObj);
	dialog.addEntry(
		new ClipboardEntry(1, ItemType.Text, 'Context menu lifetime', false, null, GLib.DateTime.new_now_utc()),
	);
	dialog.open();
	await Scripting.sleep(250);
	const findItem = (actor: Clutter.Actor): ClipboardItem | null => {
		if (actor instanceof Item) return actor as ClipboardItem;
		for (const child of actor.get_children()) {
			const item = findItem(child);
			if (item) return item;
		}
		return null;
	};
	const item = findItem(dialog);
	if (!item) throw new Error('Native context-menu card must exist');
	let itemDestroyed = false;
	item.connect('destroy', () => {
		itemDestroyed = true;
	});
	item.emit('open-menu', 100, 100, 10, 10);
	await Scripting.sleep(250);
	dialog.clearEntries();
	if (!itemDestroyed) item.destroy();
	dialog.close(); // Must not sync hover on the destroyed menu owner.
	await Scripting.sleep(250);
	dialog.destroy();
	await Scripting.sleep(500);
	console.log('Copyous native popup ownership checks passed');
}
