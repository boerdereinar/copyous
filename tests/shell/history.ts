import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';
import type { ClipboardScrollContainer } from '../../src/lib/ui/clipboardScrollContainer.js';
import type { ClipboardItem } from '../../src/lib/ui/items/clipboardItem.js';

export const METRICS = {};

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
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
	// Import the installed modules, so class identity matches the running extension.
	const uri = extension.dir.get_uri();
	const { ClipboardScrollContainer: Container } = await import(`${uri}/lib/ui/clipboardScrollContainer.js`);
	const { TextItem } = await import(`${uri}/lib/ui/items/textItem.js`);
	const { ClipboardEntry } = await import(`${uri}/lib/database/database.js`);
	const { SearchQuery, SearchChange } = await import(`${uri}/lib/ui/searchEntry.js`);
	const { StatusItem, State } = await import(`${uri}/lib/ui/items/statusItem.js`);
	const { ItemType } = await import(`${uri}/lib/common/constants.js`);
	const query = (text: string) =>
		new SearchQuery(
			SearchChange.Different,
			text,
			false,
			false,
			null,
			false,
			null,
			new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' }),
		);
	const makeItem = (id: number, time: number, content = `Synthetic ${id}`): ClipboardItem =>
		new TextItem(
			ext,
			new ClipboardEntry(id, ItemType.Text, content, false, null, GLib.DateTime.new_from_unix_utc(time)),
		);
	const items = (list: ClipboardScrollContainer): ClipboardItem[] =>
		list.get_children().filter((child) => !(child instanceof StatusItem)) as ClipboardItem[];
	const checkStatus = (list: ClipboardScrollContainer, expected: number | null) => {
		const statuses = list.get_children().filter((child) => child instanceof StatusItem);
		assert(statuses.length === (expected === null ? 0 : 1), 'Status must agree with visible history');
		if (expected !== null)
			assert((statuses[0] as InstanceType<typeof StatusItem>).state === expected, 'Wrong status message');
	};

	const list: ClipboardScrollContainer = new Container(ext);
	const status = list.get_first_child()!;
	let statusDestroyed = 0;
	status.connect('destroy', () => statusDestroyed++);
	const scroll = new St.ScrollView({ width: 600, height: 400 });
	scroll.set_child(list);
	Main.uiGroup.add_child(scroll);
	try {
		checkStatus(list, State.Empty);
		list.search(query('match'));
		const excluded = makeItem(1, 1, 'excluded');
		list.addItem(excluded);
		checkStatus(list, State.NoResults);
		const first = makeItem(2, 2, 'match');
		list.addItem(first);
		checkStatus(list, null);
		assert(
			first.has_style_pseudo_class('first-child') && first.has_style_pseudo_class('last-child'),
			'Single matching card needs both edge styles',
		);
		const tied = makeItem(3, 2, 'match');
		list.addItem(tied);
		assert(items(list)[0] === tied, 'Equal timestamps must insert newest first');
		assert(
			tied.has_style_pseudo_class('first-child') && first.has_style_pseudo_class('last-child'),
			'Edge styles must follow insertion',
		);
		first.entry.datetime = GLib.DateTime.new_from_unix_utc(3)!;
		assert(items(list)[0] === first, 'Timestamp notification must reorder the card');
		tied.entry.content = 'excluded';
		first.entry.content = 'excluded';
		checkStatus(list, State.NoResults);
		excluded.entry.content = 'match';
		checkStatus(list, null);
		let destroyed = 0;
		for (const item of items(list)) item.connect('destroy', () => destroyed++);
		list.clearItems();
		assert(destroyed === 3, 'Clearing must destroy cards and their subscriptions');
		checkStatus(list, State.Empty);
		// Kept database entries must not resurrect old actors after a view reload.
		first.entry.datetime = GLib.DateTime.new_from_unix_utc(4)!;
		first.entry.content = 'match again';
		assert(items(list).length === 0, 'Cleared actor must stay disconnected');
		const reloaded = makeItem(4, 4, 'match');
		list.addItem(reloaded);
		checkStatus(list, null);
		let removed = false;
		reloaded.connect('destroy', () => {
			removed = true;
		});
		reloaded.entry.emit('delete');
		assert(removed, 'Deleted card must be destroyed');
		checkStatus(list, State.Empty);
		// Unsorted arrival must preserve ordering, including a middle insertion.
		for (const time of [6, 3, 9, 5, 3, 8]) list.addItem(makeItem(time + 10, time, 'match'));
		assert(
			items(list)
				.map((item) => item.entry.datetime.to_unix())
				.join(',') === '9,8,6,5,3,3',
			'Unsorted history must be ordered',
		);
		for (const orientation of [Clutter.Orientation.HORIZONTAL, Clutter.Orientation.VERTICAL]) {
			list.orientation = orientation;
			await Scripting.sleep(100);
			list.focusChild(items(list)[0]!, false);
			assert(items(list)[0]!.has_key_focus(), 'Native focus must reach the first card');
			checkStatus(list, null);
		}
		global.stage.set_key_focus(null);
		list.clearItems();
		list.search(query(''));
		checkStatus(list, State.Empty);
	} finally {
		scroll.destroy(); // Exercise native parent destruction, including detached status.
	}
	assert(statusDestroyed === 1, 'Native parent destruction must release the owned status actor exactly once');

	console.log('Copyous native history regressions passed');
}
