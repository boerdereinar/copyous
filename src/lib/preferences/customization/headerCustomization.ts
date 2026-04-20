import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../prefs.js';
import { registerClass } from '../../common/gjs.js';
import { CopyousSettings, bind_enum } from '../../common/settings.js';
import { makeResettable } from '../utils.js';

@registerClass()
export class HeaderCustomization extends Adw.PreferencesGroup {
	constructor(prefs: Preferences) {
		super({
			title: _('Header'),
		});

		const showHeader = new Adw.SwitchRow({
			title: _('Show Header'),
			subtitle: _('Show the header'),
		});
		this.add(showHeader);

		const showItemTitle = new Adw.SwitchRow({
			title: _('Show Item Title'),
			subtitle: _('Show the title of the item'),
		});
		this.add(showItemTitle);

		const headerControlsVisibility = new Adw.ComboRow({
			title: _('Header Controls Visibility'),
			subtitle: _('The visibility of the header controls'),
			model: Gtk.StringList.new([_('Visible'), _('Visible on Hover'), _('Hidden')]),
		});
		this.add(headerControlsVisibility);

		// Bind properties
		const settings: CopyousSettings = prefs.getSettings();
		settings.bind('show-header', showHeader, 'active', null);
		bind_enum(settings, 'header-controls-visibility', headerControlsVisibility, 'selected');
		settings.bind('show-item-title', showItemTitle, 'active', null);

		makeResettable(headerControlsVisibility, settings, 'header-controls-visibility');

		showHeader.bind_property('active', showItemTitle, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
	}
}
