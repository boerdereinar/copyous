import GLib from 'gi://GLib';
import St from 'gi://St';

import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';
import type { FileCategory } from '../../src/lib/common/fileCategory.js';

export const METRICS = {
	typeColorChecks: { description: 'Item and file type color checks passed', units: 'checks', value: 0 },
};

function check(condition: boolean, message: string) {
	if (!condition) throw new Error(message);
	METRICS.typeColorChecks.value++;
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
	const { getFileCategory, getFilesCategory } = (await import(
		extension.dir.get_child('lib/common/fileCategory.js').get_uri()
	)) as typeof import('../../src/lib/common/fileCategory.js');
	const cases: [string, FileCategory][] = [
		['report.PDF', 'pdf'],
		['plan.xlsx', 'spreadsheet'],
		['plan.xls', 'spreadsheet'],
		['plan.ods', 'spreadsheet'],
		['plan.csv', 'spreadsheet'],
		['plan.tsv', 'spreadsheet'],
		['document.docx', 'document'],
		['document.doc', 'document'],
		['document.odt', 'document'],
		['slides.pptx', 'document'],
		['photo.png', 'image'],
		['drawing.svg', 'image'],
		['music.mp3', 'audio'],
		['recording.ogg', 'audio'],
		['clip.mp4', 'video'],
		['example.apk', 'application'],
		['backup.zip', 'archive'],
		['notes.txt', 'text'],
		['unknown.xyz123', 'other'],
	];
	for (const [name, category] of cases) {
		check(getFileCategory(`file:///tmp/${name}`) === category, `Incorrect category for ${name}`);
	}
	check(getFilesCategory([]) === 'other', 'Empty groups use a neutral color');
	check(getFilesCategory(['file:///a.pdf', 'file:///b.PDF']) === 'pdf', 'Homogeneous groups use the file category');
	check(getFilesCategory(['file:///a.pdf', 'file:///b.ods']) === 'other', 'Mixed groups use a neutral color');
	const { ClipboardEntry } = (await import(
		extension.dir.get_child('lib/database/database.js').get_uri()
	)) as typeof import('../../src/lib/database/database.js');
	const { ClipboardItem } = (await import(
		extension.dir.get_child('lib/ui/items/clipboardItem.js').get_uri()
	)) as typeof import('../../src/lib/ui/items/clipboardItem.js');
	const { Icon } = (await import(
		extension.dir.get_child('lib/common/icons.js').get_uri()
	)) as typeof import('../../src/lib/common/icons.js');
	const original = extension.settings.get_value('color-by-item-type');
	extension.settings.set_boolean('color-by-item-type', false);
	const entry = new ClipboardEntry(
		1000,
		'File',
		'file:///tmp/report.pdf',
		false,
		'green',
		GLib.DateTime.new_now_utc(),
	);
	const item = new ClipboardItem(extension, entry, Icon.File, 'File');
	Main.uiGroup.add_child(item);
	try {
		check(!item.has_style_class_name('type-colors'), 'Colors are optional');
		check(item.has_style_class_name('file-category-pdf'), 'File cards include their format category');
		extension.settings.set_boolean('color-by-item-type', true);
		check(item.has_style_class_name('type-colors'), 'Enable colors on existing cards');
		await Scripting.waitLeisure();
		const border = item.get_theme_node().get_border_color(St.Side.LEFT);
		check(border.red === 230 && border.green === 45 && border.blue === 66, 'PDF cards have a red accent');
		check(item.get_theme_node().get_border_width(St.Side.LEFT) === 3, 'Type accents are visible');
		const header = (item.get_child() as St.Widget).get_first_child() as St.Widget;
		check(header.has_style_class_name('green'), 'Preserve the user tag');
		extension.settings.set_boolean('color-by-item-type', false);
		check(!item.has_style_class_name('type-colors'), 'Disable colors on existing cards');
	} finally {
		item.destroy();
		extension.settings.set_value('color-by-item-type', original);
	}
	print(`PASS: ${METRICS.typeColorChecks.value} type color checks`);
}
