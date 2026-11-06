import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';
import type { ClipboardEntry, CodeMetadata } from '../../src/lib/database/database.js';

export const METRICS = {
	codeClipboardChecks: { description: 'Code capture checks passed', units: 'checks', value: 0 },
};

function check(condition: boolean, message: string) {
	if (!condition) throw new Error(message);
	METRICS.codeClipboardChecks.value++;
}

function foregroundColors(label: St.Label): Set<string> {
	const attributes = label.clutter_text.get_layout().get_attributes()?.to_string() ?? '';
	return new Set([...attributes.matchAll(/\bforeground (#[a-f\d]+)/gi)].map((match) => match[1]!));
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
	const highlighterSource = GLib.getenv('COPYOUS_HLJS_SOURCE');
	if (!highlighterSource)
		throw new Error('Set COPYOUS_HLJS_SOURCE to the optional highlighter used for color checks');
	for (let i = 0; i < 50 && extension.hljs === undefined; i++) {
		// eslint-disable-next-line no-await-in-loop
		await Scripting.sleep(50);
	}
	const target = Gio.File.new_for_path(GLib.get_user_data_dir() + '/copyous@boerdereinar.dev/highlight.min.js');
	Gio.File.new_for_path(highlighterSource).copy(target, Gio.FileCopyFlags.OVERWRITE, null, null);
	for (let i = 0; i < 50 && !extension.hljs; i++) {
		// eslint-disable-next-line no-await-in-loop
		await Scripting.sleep(100);
	}
	check(extension.hljs != null, 'Load the optional highlighter for actual color checks');
	const { CodeItem } = (await import(
		extension.dir.get_child('lib/ui/items/codeItem.js').get_uri()
	)) as typeof import('../../src/lib/ui/items/codeItem.js');
	const settings = extension.settings.get_child('code-item');
	settings.set_boolean('syntax-highlighting', true);
	settings.set_boolean('show-line-numbers', false);
	await Scripting.sleep(500);
	extension.settings.set_enum('database-backend', 1);
	extension.settings.set_boolean('incognito', false);
	await Scripting.sleep(500);
	const manager = extension.clipboardManager!;
	const clipboard = St.Clipboard.get_default();
	for (const [text, expected, language] of [
		['const answer = 42;', 'Code', 'javascript'],
		['def greet(name):\n    return name', 'Code', 'python'],
		['git status --short', 'Code', 'bash'],
		['sudo apt update', 'Code', 'bash'],
		['echo "Olá"', 'Code', 'bash'],
		[
			'dev@ubuntu:~$ sudo apt update\n[sudo: authenticate] Senha: \nAtingido:1 http://archive.ubuntu.com/ubuntu stable InRelease\nObtidos 147 kB em 1s\n2 pacotes podem ser atualizados.\ndev@ubuntu:~$',
			'Code',
			'shell',
		],
		['{"name":"Copyous","enabled":true}', 'Code', 'json'],
		['O código usa uma função para calcular o total. Depois, retorna o resultado.', 'Text', null],
		['Nome: Maria\nTelefone: 12345\nCidade: Manaus', 'Text', null],
	] as const) {
		// eslint-disable-next-line no-await-in-loop
		const entry = await new Promise<ClipboardEntry>((resolve, reject) => {
			const id = manager.connect('clipboard', (_manager, value) => {
				GLib.source_remove(timeout);
				manager.disconnect(id);
				resolve(value);
			});
			const timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
				manager.disconnect(id);
				reject(new Error('Clipboard capture timed out'));
				return GLib.SOURCE_REMOVE;
			});
			clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
		});
		check(entry.type === expected, 'Capture the correct code/text item type');
		check(entry.content === text, 'Preserve copied bytes as text');
		if (language) check((entry.metadata as CodeMetadata).language?.id === language, 'Store the detected language');
		if (expected === 'Code') {
			const card = new CodeItem(extension, entry);
			Main.uiGroup.add_child(card);
			try {
				const content = card.get_child()?.get_children()[1] as St.Widget;
				const label = content
					.get_children()
					.find(
						(child) => child instanceof St.Label && child.has_style_class_name('code-item-content'),
					) as St.Label;
				check(label != null, 'Render a code label');
				const font = label.clutter_text.get_layout().get_context().load_font(label.get_theme_node().get_font());
				check(
					font?.get_face()?.get_family()?.is_monospace === true,
					'Render code using an actual monospace font',
				);
				check(foregroundColors(label).size >= 2, `Render colored syntax in the actual ${language} text layout`);
				if (language === 'shell') {
					check(
						foregroundColors(label).size >= 3,
						'Terminal prompt, command and output use distinct text colors',
					);
					check(
						label.clutter_text.get_text().includes('dev@ubuntu:~$ sudo apt update'),
						'Keep the complete terminal prompt visible',
					);
					const markup = 'dev@ubuntu:~$ echo "<span>&"\n<output>&\ndev@ubuntu:~$';
					entry.content = markup;
					check(
						label.clutter_text.get_text().includes('<output>&'),
						'Escape terminal output safely in the styled label',
					);
					entry.content = text;
					const highlighter = extension.hljs;
					extension.hljs = null;
					const fallback = new CodeItem(extension, entry);
					const fallbackLabel = (
						fallback.get_child()?.get_children()[1] as St.Widget
					).get_first_child() as St.Label;
					check(
						fallbackLabel.clutter_text.get_layout().get_attributes()?.to_string().includes('foreground') ===
							true,
						'Terminal colors remain available without the optional highlighter',
					);
					fallback.destroy();
					extension.hljs = highlighter;
				}
				settings.set_boolean('syntax-highlighting', false);
				check(foregroundColors(label).size <= 1, 'Respect disabled syntax highlighting');
				settings.set_boolean('syntax-highlighting', true);
			} finally {
				card.destroy();
			}
		}
		// eslint-disable-next-line no-await-in-loop
		await manager.copyEntry(entry);
		// eslint-disable-next-line no-await-in-loop
		const restored = await new Promise<string | null>((resolve) =>
			clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, value) => resolve(value)),
		);
		check(restored === text, 'Restoring the history item preserves the complete original text');
	}
	print(`PASS: ${METRICS.codeClipboardChecks.value} code clipboard checks`);
}
