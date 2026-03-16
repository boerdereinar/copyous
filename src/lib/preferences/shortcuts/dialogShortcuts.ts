import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { registerClass } from '../../common/gjs.js';
import { bind_enum } from '../../common/settings.js';
import { makeResettable } from '../utils.js';
import { ShortcutRow } from './shortcutRow.js';

@registerClass()
export class DialogShortcuts extends Adw.PreferencesGroup {
	constructor(prefs: ExtensionPreferences) {
		super({
			title: _('Dialog'),
		});

		const openDialog = new ShortcutRow(_('Open Clipboard Dialog'), '', true);
		this.add(openDialog);

		const toggleIncognito = new ShortcutRow(_('Toggle Incognito Mode'), '', true);
		this.add(toggleIncognito);

		const openDialogBehaviour = new Adw.ComboRow({
			title: _('Open Clipboard Dialog Behavior'),
			model: Gtk.StringList.new([_('Toggle Dialog'), _('Open / Select Next Item')]),
		});
		this.add(openDialogBehaviour);

		// Bind properties
		const settings = prefs.getSettings();
		settings.bind('open-clipboard-dialog-shortcut', openDialog, 'shortcuts', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('toggle-incognito-mode-shortcut', toggleIncognito, 'shortcuts', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(settings, 'open-clipboard-dialog-behavior', openDialogBehaviour, 'selected');

		makeResettable(openDialog, settings, 'open-clipboard-dialog-shortcut');
		makeResettable(toggleIncognito, settings, 'toggle-incognito-mode-shortcut');
		makeResettable(openDialogBehaviour, settings, 'open-clipboard-dialog-behavior');
	}
}
