import Adw from 'gi://Adw';
import type Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../prefs.js';
import { registerClass } from '../../common/gjs.js';

@registerClass()
export class VersionSettings extends Adw.PreferencesGroup {
	constructor(prefs: Preferences, window: Adw.PreferencesWindow) {
		const metadata = prefs.metadata as ExtensionMetadata;

		const version = metadata['version-name'] ?? metadata['version'] ?? _('Unknown');

		super({
			title: _('Version'),
		});

		const row = new Adw.ActionRow({
			title: _('Installed build'),
			subtitle: version,
			css_classes: ['property'],
		});

		const copyButton = new Gtk.Button({
			icon_name: 'edit-copy-symbolic',
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
			tooltip_text: _('Copy version'),
		});
		copyButton.connect('clicked', () => {
			window.get_display().get_clipboard().set(version);
			window.add_toast(
				new Adw.Toast({
					title: _('Copied to clipboard'),
				}),
			);
		});
		row.add_suffix(copyButton);

		this.add(row);
	}
}

interface ExtensionMetadata {
	readonly 'uuid': string;
	readonly 'dir': Gio.File;
	readonly 'path': string;
	readonly 'name': string;
	readonly 'description': string;
	readonly 'version'?: string;
	readonly 'url'?: string;
	readonly 'shell-version': string[];
	readonly 'settings-schema'?: string;
	readonly 'gettext-domain'?: string;
	readonly 'original-author'?: string[];
	readonly 'extension-id'?: string;
	readonly 'version-name'?: string;
}
