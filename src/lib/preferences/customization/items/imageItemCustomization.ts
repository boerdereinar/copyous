import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../../prefs.js';
import { registerClass } from '../../../common/gjs.js';
import { bind_enum } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';

@registerClass()
export class ImageItemCustomization extends Adw.ExpanderRow {
	constructor(prefs: Preferences) {
		super({
			title: _('Image Item'),
			subtitle: _('Configure image clipboard items'),
		});

		const showImageInfo = new Adw.SwitchRow({
			title: _('Show Image Info'),
			subtitle: _('Show extra information in the image item'),
		});
		this.add_row(showImageInfo);

		const backgroundSize = new Adw.ComboRow({
			title: _('Background Size'),
			subtitle: _('Background size of the image'),
			model: Gtk.StringList.new([_('Cover'), _('Contain')]),
		});
		this.add_row(backgroundSize);

		// Bind properties
		const settings = prefs.getSettings().get_child('image-item');
		settings.bind('show-image-info', showImageInfo, 'active', null);
		bind_enum(settings, 'background-size', backgroundSize, 'selected');

		makeResettable(backgroundSize, settings, 'background-size');
	}
}
