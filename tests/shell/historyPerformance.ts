import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';
import type { ClipboardScrollContainer } from '../../src/lib/ui/clipboardScrollContainer.js';

export const METRICS = {
	historyInsertAscending: { description: 'Insert 1000 preconstructed cards, oldest first', units: 'ms', value: 0 },
	historyInsertDescending: { description: 'Insert 1000 preconstructed cards, newest first', units: 'ms', value: 0 },
	historyPopulateAscending: { description: 'Construct and insert 1000 cards, oldest first', units: 'ms', value: 0 },
	historyPopulateDescending: { description: 'Construct and insert 1000 cards, newest first', units: 'ms', value: 0 },
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
	const { ClipboardScrollContainer: Container } = await import(`${uri}/lib/ui/clipboardScrollContainer.js`);
	const { TextItem } = await import(`${uri}/lib/ui/items/textItem.js`);
	const { ClipboardEntry } = await import(`${uri}/lib/database/database.js`);
	const { ItemType } = await import(`${uri}/lib/common/constants.js`);
	// The same script can measure upstream and the candidate without modifying either build.
	for (const [direction, insertion, population] of [
		[1, METRICS.historyInsertAscending, METRICS.historyPopulateAscending],
		[-1, METRICS.historyInsertDescending, METRICS.historyPopulateDescending],
	] as const) {
		const container: ClipboardScrollContainer = new Container(ext);
		try {
			const start = GLib.get_monotonic_time();
			const cards = Array.from(
				{ length: 1000 },
				(_, i) =>
					new TextItem(
						ext,
						new ClipboardEntry(
							i,
							ItemType.Text,
							`Synthetic ${i}`,
							false,
							null,
							GLib.DateTime.new_from_unix_utc(10000 + i * direction),
						),
					),
			);
			const insertStart = GLib.get_monotonic_time();
			for (const item of cards) container.addItem(item);
			const end = GLib.get_monotonic_time();
			insertion.value = (end - insertStart) / 1000;
			population.value = (end - start) / 1000;
			if (container.get_n_children() !== 1000)
				throw new Error('Benchmark must insert all cards and remove empty status');
			const actual = container.get_children() as InstanceType<typeof TextItem>[];
			if (!actual.every((item, i) => i === 0 || actual[i - 1]!.entry.datetime.compare(item.entry.datetime) >= 0))
				throw new Error('Benchmark ordering must be correct');
		} finally {
			container.destroy();
		}
	}
}
