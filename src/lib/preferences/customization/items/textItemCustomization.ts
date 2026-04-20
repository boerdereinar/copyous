import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../../prefs.js';
import { registerClass } from '../../../common/gjs.js';
import { bind_enum } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';

@registerClass()
export class TextItemCustomization extends Adw.ExpanderRow {
	constructor(prefs: Preferences) {
		super({
			title: _('Text Item'),
			subtitle: _('Configure text clipboard items'),
		});

		const showTextInfo = new Adw.SwitchRow({
			title: _('Show Text Info'),
			subtitle: _('Show extra information in the text item'),
		});
		this.add_row(showTextInfo);

		const textCounter = new Adw.ComboRow({
			title: _('Text Count Mode'),
			subtitle: _('Show the number of characters, words or lines'),
			model: Gtk.StringList.new([_('Characters'), _('Words'), _('Lines')]),
		});
		this.add_row(textCounter);

		// Bind properties
		const settings = prefs.getSettings().get_child('text-item');
		settings.bind('show-text-info', showTextInfo, 'active', null);
		bind_enum(settings, 'text-count-mode', textCounter, 'selected');

		makeResettable(textCounter, settings, 'text-count-mode');

		showTextInfo.bind_property('active', textCounter, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
	}
}
