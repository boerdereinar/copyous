import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';

export const METRICS = {};
export async function run() {
	let extension;
	for (let i = 0; i < 100; i++) {
		extension = Main.extensionManager.lookup('copyous@boerdereinar.dev');
		if (extension?.state === 1) break;
		await Scripting.sleep(100);
	}
	if (extension?.state !== 1) throw Error('Not enabled');
	const ext = extension.stateObj as CopyousExtension,
		uri = extension.dir.get_uri();
	const { Label } = await import(`${uri}/lib/ui/components/label.js`);
	const { ClipboardEntry } = await import(`${uri}/lib/database/database.js`);
	const { ItemType } = await import(`${uri}/lib/common/constants.js`);
	const dialog = ext.clipboardDialog!;
	ext.settings.set_enum('clipboard-orientation', Clutter.Orientation.VERTICAL);
	ext.settings.set_boolean('dynamic-item-height', true);
	ext.settings.get_child('text-item').set_boolean('show-text-info', false);
	await Scripting.sleep(500);
	const walk = (a: Clutter.Actor): Clutter.Actor[] => [a, ...a.get_children().flatMap(walk)];
	const out = GLib.dir_make_tmp('copyous-preview-visual-XXXXXX');
	const cases = [
		['short', 300, 200, 'A short unchanged preview.'],
		['lines', 300, 200, 'A long synthetic paragraph with wrapped text.\n'.repeat(3000)],
		['paragraph', 300, 200, 'A long synthetic paragraph with wrapped text. '.repeat(3000)],
		['emoji', 300, 200, '👩🏽‍🚒 é 🇨🇦 😀 '.repeat(6000)],
		['rtl', 300, 200, 'שלום עולם مرحبا بالعالم\n'.repeat(6000)],
		['inherited-rtl', 300, 200, 'English\nעברית\n' + '12345 '.repeat(3000)],
		['neutral-first', 300, 200, '12345 '.repeat(3000) + '\nעברית'],
		['late-rtl', 300, 200, '12345 '.repeat(3000) + 'עברית'],
		['indent', 600, 300, '    A synthetically indented line.\n'.repeat(5000) + 'No indentation'],
		['large', 1000, 1000, 'A long synthetic paragraph with wrapped text.\n'.repeat(5000)],
	] as const;
	async function snap(label: St.Label, path: string) {
		await Scripting.waitLeisure();
		await Scripting.sleep(100);
		const [x, y] = label.get_transformed_position(),
			[w, h] = label.get_transformed_size();
		const xx = Math.max(0, Math.ceil(x)),
			yy = Math.max(0, Math.ceil(y));
		const ww = Math.min(Math.floor(w), global.stage.width - xx),
			hh = Math.min(Math.floor(h), global.stage.height - yy);
		if (ww <= 0 || hh <= 0) throw Error('Unmapped preview');
		const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
		await new Shell.Screenshot().screenshot_area(xx, yy, ww, hh, stream);
		stream.close(null);
	}
	for (const [name, width, height, content] of cases) {
		dialog.clearEntries();
		ext.settings.set_int('item-width', width);
		ext.settings.set_int('item-height', height);
		dialog.addEntry(new ClipboardEntry(1, ItemType.Text, content, false, null, GLib.DateTime.new_now_utc()));
		const label = walk(dialog).find((a) => a instanceof Label) as InstanceType<typeof Label> | undefined;
		if (!label) throw Error('No label');
		const budget = Math.max(4096, Math.ceil((width * height) / 16));
		label.setPreviewLimit(0);
		dialog.open();
		if (!dialog.opened) throw Error('Not opened');
		const before = `${out}/${name}-before.png`,
			after = `${out}/${name}-after.png`;
		await snap(label, before);
		label.setPreviewLimit(budget);
		await snap(label, after);
		const a = GdkPixbuf.Pixbuf.new_from_file(before),
			b = GdkPixbuf.Pixbuf.new_from_file(after);
		if (a.width !== b.width || a.height !== b.height)
			throw Error(`${name}: allocation changed ${a.width}x${a.height} to ${b.width}x${b.height}`);
		const ap = a.get_pixels(),
			bp = b.get_pixels();
		if (!ap || !bp) throw Error('No screenshot pixels');
		let changed = 0;
		for (let y = 0; y < a.height; y++)
			for (let x = 0; x < a.width * a.n_channels; x++)
				if (ap[y * a.rowstride + x] !== bp[y * b.rowstride + x]) changed++;
		if (changed) throw Error(`${name}: ${changed} channels differ, files ${out}`);
		console.log(`Copyous visual ${name}: pixel-identical ${a.width}x${a.height}`);
		dialog.close();
		await Scripting.waitLeisure();
	}
	Main.extensionManager.disableExtension('copyous@boerdereinar.dev');
	await Scripting.sleep(500);
	console.log(`Copyous visual comparisons passed: ${out}`);
}
