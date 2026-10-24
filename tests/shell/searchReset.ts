import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';

export const METRICS = {
	searchResetEmissions: { description: 'Search emissions while resetting four filters', units: 'searches', value: 0 },
};

export async function run() {
	let extension;
	for (let i = 0; i < 100; i++) {
		extension = Main.extensionManager.lookup('copyous@boerdereinar.dev');
		if (extension?.state === 1) break;
		await Scripting.sleep(100);
	}
	if (extension?.state !== 1) throw new Error('Extension must be enabled');
	const ext = extension.stateObj as CopyousExtension;
	const uri = extension.dir.get_uri();
	const { SearchEntry } = await import(`${uri}/lib/ui/searchEntry.js`);
	const { ClipboardEntry } = await import(`${uri}/lib/database/database.js`);
	const { ItemType, Tags } = await import(`${uri}/lib/common/constants.js`);
	const entries = Array.from(
		{ length: 1000 },
		(_, i) => new ClipboardEntry(i, ItemType.Text, `Synthetic ${i}`, false, null, GLib.DateTime.new_now_utc()),
	);
	const dialog = ext.clipboardDialog;
	if (!dialog) throw new Error('Clipboard dialog must exist');
	const findEntry = (actor: Clutter.Actor): InstanceType<typeof SearchEntry> | null => {
		if (actor instanceof SearchEntry) return actor;
		for (const child of actor.get_children()) {
			const found = findEntry(child);
			if (found) return found;
		}
		return null;
	};
	const entry = findEntry(dialog);
	if (!entry) throw new Error('Native search entry must exist');
	ext.settings.set_boolean('remember-search', false);
	try {
		dialog.open();
		await Scripting.waitLeisure();
		entry.grab_key_focus();
		await Scripting.sleep(100);
		entry.text = 'Synthetic';
		entry.pinned = true;
		entry.tag = Tags[0];
		entry.type = ItemType.Text;
		let emissions = 0;
		entry.connect('search', (_entry: unknown, query: InstanceType<typeof SearchEntry>['searchQuery']) => {
			emissions++;
			for (const item of entries) query.matchesEntry(true, item, item.content);
		});
		dialog.close();
		await Scripting.waitLeisure();
		METRICS.searchResetEmissions.value = emissions;
		if (emissions !== 1) throw new Error(`Expected one reset search, got ${emissions}`);
		if (entry.text !== '' || entry.pinned || entry.tag !== null || entry.type !== null)
			throw new Error('All filters must reset');
		dialog.open();
		await Scripting.waitLeisure();
		entry.grab_key_focus();
		await Scripting.sleep(100);
		emissions = 0;
		dialog.close();
		await Scripting.waitLeisure();
		if (emissions !== 0) throw new Error('Empty reset must not search');
		dialog.open();
		await Scripting.waitLeisure();
		entry.grab_key_focus();
		await Scripting.sleep(100);
		ext.settings.set_boolean('remember-search', true);
		entry.text = 'Keep';
		emissions = 0;
		dialog.close();
		await Scripting.waitLeisure();
		if (entry.text !== 'Keep' || emissions !== 0) throw new Error('Remembered filters must remain unchanged');
	} finally {
		dialog.close();
	}
	console.log('Copyous native search reset checks passed');
}
