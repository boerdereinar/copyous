import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { registerClass } from '../../common/gjs.js';
import { bind_enum } from '../../common/settings.js';
import { makeResettable } from '../utils.js';
import { ShortcutRow } from './shortcutRow.js';

@registerClass()
export class ItemShortcuts extends Adw.PreferencesGroup {
	constructor(prefs: ExtensionPreferences) {
		super({
			title: _('Item'),
		});

		const pinItem = new ShortcutRow(_('Pin Item'), '', true);
		this.add(pinItem);

		const deleteItem = new ShortcutRow(_('Delete Item'), 'Delete', true);
		deleteItem.subtitle = _('Holding shift force deletes');
		this.add(deleteItem);

		const editItem = new ShortcutRow(_('Edit Item'), '', true);
		editItem.subtitle = _('Only supported for text and code items');
		this.add(editItem);

		const editTitle = new ShortcutRow(_('Edit Title'), '', true);
		this.add(editTitle);

		const openMenu = new ShortcutRow(_('Open Menu'), '', true);
		this.add(openMenu);

		const middleClickAction = new Adw.ComboRow({
			title: _('Middle Click Action'),
			model: Gtk.StringList.new([_('None'), _('Pin Item'), _('Delete Item')]),
		});
		this.add(middleClickAction);

		// Bind properties
		const settings = prefs.getSettings();
		settings.bind('pin-item-shortcut', pinItem, 'shortcuts', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('delete-item-shortcut', deleteItem, 'shortcuts', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('edit-item-shortcut', editItem, 'shortcuts', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('edit-title-shortcut', editTitle, 'shortcuts', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('open-menu-shortcut', openMenu, 'shortcuts', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(settings, 'middle-click-action', middleClickAction, 'selected');

		makeResettable(pinItem, settings, 'pin-item-shortcut');
		makeResettable(deleteItem, settings, 'delete-item-shortcut');
		makeResettable(editItem, settings, 'edit-item-shortcut');
		makeResettable(editTitle, settings, 'edit-title-shortcut');
		makeResettable(openMenu, settings, 'open-menu-shortcut');
		makeResettable(middleClickAction, settings, 'middle-click-action');
	}
}

@registerClass()
export class ItemActivationShortcuts extends Adw.PreferencesGroup {
	constructor() {
		super();

		this.add(new ShortcutRow(_('Copy Item'), 'Return space'));
		this.add(new ShortcutRow(_('Activate Default Action'), '<Ctrl>Return space'));
	}
}
