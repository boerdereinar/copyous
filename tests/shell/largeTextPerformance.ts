import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';

export const METRICS = {
	largeTextOpen: { description: 'Synchronous opening of 50 cards including four large texts', units: 'ms', value: 0 },
	largeTextColdReopen: {
		description: 'Synchronous reopening after invalidating native text-layout caches',
		units: 'ms',
		value: 0,
	},
	largeTextMaxHeartbeatGap: {
		description: 'Longest main-loop heartbeat gap during large-text opening',
		units: 'ms',
		value: 0,
	},
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
	const { Label } = await import(`${uri}/lib/ui/components/label.js`);
	const { ClipboardEntry } = await import(`${uri}/lib/database/database.js`);
	const { ItemType } = await import(`${uri}/lib/common/constants.js`);
	const dialog = ext.clipboardDialog!;
	ext.settings.set_int('item-width', 300);
	ext.settings.set_int('item-height', 200);
	ext.settings.set_enum('clipboard-orientation', Clutter.Orientation.VERTICAL);
	ext.settings.set_boolean('dynamic-item-height', true);
	ext.settings.get_child('text-item').set_boolean('show-text-info', false);
	await Scripting.sleep(500);
	dialog.clearEntries();
	for (let i = 0; i < 50; i++) {
		const length = i < 4 ? [150993, 133803, 97313, 65518][i]! : 100;
		const content = 'Synthetic text of a clipboard preview.\n'.repeat(Math.ceil(length / 38)).slice(0, length);
		dialog.addEntry(new ClipboardEntry(i, ItemType.Text, content, false, null, GLib.DateTime.new_now_utc()));
	}
	const walk = (actor: Clutter.Actor): Clutter.Actor[] => [actor, ...actor.get_children().flatMap(walk)];
	const labels = walk(dialog).filter((actor) => actor instanceof Label) as InstanceType<typeof Label>[];
	// Same binary and native actors for the unbounded before/after comparison.
	if (GLib.getenv('COPYOUS_UNBOUNDED_PREVIEWS') === '1') for (const label of labels) label.setPreviewLimit(0);
	for (const phase of ['first', 'cold-reopen']) {
		if (phase === 'cold-reopen') {
			for (const label of labels) {
				const font = label.clutter_text.font_name;
				label.clutter_text.font_name = 'Monospace 12';
				label.clutter_text.font_name = font;
			}
		}
		let previous = GLib.get_monotonic_time();
		const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
			const now = GLib.get_monotonic_time();
			METRICS.largeTextMaxHeartbeatGap.value = Math.max(
				METRICS.largeTextMaxHeartbeatGap.value,
				(now - previous) / 1000,
			);
			previous = now;
			return GLib.SOURCE_CONTINUE;
		});
		try {
			const start = GLib.get_monotonic_time();
			dialog.open();
			const elapsed = (GLib.get_monotonic_time() - start) / 1000;
			if (!dialog.opened) throw new Error('The measured dialog must actually open');
			if (phase === 'first') METRICS.largeTextOpen.value = elapsed;
			else METRICS.largeTextColdReopen.value = elapsed;
			await Scripting.waitLeisure();
		} finally {
			GLib.source_remove(timer);
		}
		dialog.close();
		await Scripting.waitLeisure();
	}
	Main.extensionManager.disableExtension('copyous@boerdereinar.dev');
	await Scripting.sleep(500);
}
