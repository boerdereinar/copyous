import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../../prefs.js';
import { registerClass } from '../../../common/gjs.js';

@registerClass()
export class CharacterItemCustomization extends Adw.ExpanderRow {
	constructor(prefs: Preferences) {
		super({
			title: _('Character Item'),
			subtitle: _('Configure character clipboard items'),
		});

		const maxCharacters = new Adw.SpinRow({
			title: _('Maximum Characters'),
			subtitle: _('Maximum number of characters that are recognized as a character item'),
			adjustment: new Gtk.Adjustment({ lower: 1, upper: 4, step_increment: 1, value: 1 }),
		});
		this.add_row(maxCharacters);

		const showUnicode = new Adw.SwitchRow({
			title: _('Show Unicode'),
			subtitle: _('Show the Unicode of the character'),
		});
		this.add_row(showUnicode);

		// Bind properties
		const settings = prefs.getSettings().get_child('character-item');
		settings.bind('max-characters', maxCharacters, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-unicode', showUnicode, 'active', Gio.SettingsBindFlags.DEFAULT);
	}
}
