import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';

export const METRICS = {};
function assert(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message);
}

export async function run() {
	let extension;
	for (let i = 0; i < 100; i++) {
		extension = Main.extensionManager.lookup('copyous@boerdereinar.dev');
		if (extension?.state === 1) break;
		await Scripting.sleep(100);
	}
	assert(extension?.state === 1, 'Extension must be enabled');
	const ext = extension.stateObj as CopyousExtension;
	const uri = extension.dir.get_uri();
	const { Label, textPreview, normalizeIndentation, trim } = await import(`${uri}/lib/ui/components/label.js`);
	const { TextItem } = await import(`${uri}/lib/ui/items/textItem.js`);
	const { ClipboardEntry } = await import(`${uri}/lib/database/database.js`);
	const { SearchQuery, SearchChange } = await import(`${uri}/lib/ui/searchEntry.js`);
	const { ItemType } = await import(`${uri}/lib/common/constants.js`);
	const { EditDialog } = await import(`${uri}/lib/ui/components/editDialog.js`);
	const payload = '\tFull payload\n' + '    Synthetic text paragraph.\n'.repeat(600) + 'TAIL_SEARCH_SENTINEL';
	const normalized = normalizeIndentation(trim(payload), 4);
	const label = new Label({});
	try {
		label.label = payload;
		assert(label.text === normalized, 'Unbounded labels must keep existing normalization');
		label.setPreviewLimit(4096);
		assert(label.label === payload, 'The label property must retain complete content');
		assert(label.text.length <= 4098, 'Only render the bounded prefix and direction/ellipsis marks');
		assert(label.accessible_name === normalized, 'Accessibility name must retain complete text');
		label.setPreviewLimit(62500);
		assert(label.text.length > 4098 && label.label === payload, 'Larger cards must expose a larger preview');
		label.setPreviewLimit(0);
		assert(label.text === normalized, 'Removing the limit must restore the whole normalized string');
	} finally {
		label.destroy();
	}
	for (const cluster of ['😀', '👩🏽‍🚒', 'e\u0301', '🇨🇦']) {
		const text = 'ab' + cluster + 'tail';
		for (let limit = 3; limit < 2 + cluster.length; limit++)
			assert(textPreview(text, limit).startsWith('ab\u200e…'), 'Preview must not split grapheme clusters');
	}
	assert(textPreview('small', 4096) === 'small', 'Short text must be unchanged');
	const rtl = '12345 '.repeat(1000) + 'עברית';
	assert(
		Pango.find_base_dir(textPreview(rtl, 4096), -1) === Pango.Direction.RTL,
		'Preserve direction when the first strong character is outside the prefix',
	);

	ext.settings.set_int('item-width', 300);
	ext.settings.set_int('item-height', 200);
	const entry = new ClipboardEntry(1, ItemType.Text, payload, false, null, GLib.DateTime.new_now_utc());
	const item = new TextItem(ext, entry);
	try {
		const findLabel = (actor: Clutter.Actor): InstanceType<typeof Label> | null => {
			if (actor instanceof Label) return actor;
			for (const child of actor.get_children()) {
				const result = findLabel(child);
				if (result) return result;
			}
			return null;
		};
		const preview = findLabel(item);
		assert(preview && preview.text.length <= 4098, 'Text cards must opt into bounded rendering');
		item.search(
			new SearchQuery(
				SearchChange.Different,
				'TAIL_SEARCH_SENTINEL',
				false,
				false,
				null,
				false,
				null,
				new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' }),
			),
		);
		assert(item.visible, 'Search must match content outside the rendered preview');
		ext.settings.set_int('item-width', 1000);
		ext.settings.set_int('item-height', 1000);
		assert(preview.text.length > 4098 && entry.content === payload, 'Resizing must adjust only the preview');
		assert(ext.clipboardManager, 'Clipboard manager must be initialized');
		await ext.clipboardManager.copyEntry(entry);
		const copied = await new Promise<string>((resolve, reject) => {
			let timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
				timeout = 0;
				reject(new Error('Clipboard read timed out'));
				return GLib.SOURCE_REMOVE;
			});
			St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
				if (!timeout) return;
				GLib.source_remove(timeout);
				timeout = 0;
				resolve(text ?? '');
			});
		});
		assert(copied === payload, 'Real clipboard copying must preserve the entire original payload');
		const editor = new EditDialog(ext, entry);
		try {
			assert(editor._entry.clutterText.text === payload, 'The editor must receive the complete original text');
		} finally {
			editor.destroy();
		}
	} finally {
		item.destroy();
	}
	Main.extensionManager.disableExtension('copyous@boerdereinar.dev');
	await Scripting.sleep(500);
	console.log('Copyous full-content and Unicode preview regressions passed');
}
