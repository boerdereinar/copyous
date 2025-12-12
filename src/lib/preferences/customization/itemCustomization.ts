import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { registerClass } from '../../common/gjs.js';
import { makeResettable } from '../utils.js';

@registerClass()
export class ItemCustomization extends Adw.PreferencesGroup {
	constructor(prefs: ExtensionPreferences) {
		super({
			title: _('Item'),
		});

		const itemWidth = new Adw.SpinRow({
			title: _('Item Width'),
			subtitle: _('Change the width of the clipboard items'),
			adjustment: new Gtk.Adjustment({
				lower: 200,
				upper: 1000,
				step_increment: 1,
				page_increment: 5,
				value: 300,
			}),
		});
		this.add(itemWidth);

		const itemHeight = new Adw.SpinRow({
			title: _('Item Height'),
			subtitle: _('Change the height of the clipboard items'),
			adjustment: new Gtk.Adjustment({
				lower: 50,
				upper: 1000,
				step_increment: 1,
				page_increment: 5,
				value: 200,
			}),
		});
		this.add(itemHeight);

		const dynamicHeight = new Adw.SwitchRow({
			title: _('Dynamic Item Height'),
			subtitle: _(
				'Dynamically adjust the height of the clipboard items based on their content. ' +
					'Only works in vertical orientation',
			),
		});
		this.add(dynamicHeight);

		const tabWidth = new Adw.SpinRow({
			title: _('Tab Width'),
			subtitle: _('Change the width of a tab character in the clipboard items'),
			adjustment: new Gtk.Adjustment({ lower: 1, upper: 8, step_increment: 1, value: 4 }),
		});
		this.add(tabWidth);

		const settings = prefs.getSettings();
		settings.bind('item-width', itemWidth, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('item-height', itemHeight, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('dynamic-item-height', dynamicHeight, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('tab-width', tabWidth, 'value', Gio.SettingsBindFlags.DEFAULT);

		dynamicHeight.sensitive = settings.get_enum('clipboard-orientation') === 1;
		settings.connect(
			'changed::clipboard-orientation',
			() => (dynamicHeight.sensitive = settings.get_enum('clipboard-orientation') === 1),
		);

		makeResettable(itemWidth, settings, 'item-width');
		makeResettable(itemHeight, settings, 'item-height');
		makeResettable(tabWidth, settings, 'tab-width');
	}
}
