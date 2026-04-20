import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../../prefs.js';
import { registerClass } from '../../../common/gjs.js';
import { bind_enum } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';

@registerClass()
export class CodeItemCustomization extends Adw.ExpanderRow {
	constructor(prefs: Preferences) {
		super({
			title: _('Code Item'),
			subtitle: _('Configure code clipboard items'),
		});

		const syntaxHighlighting = new Adw.SwitchRow({
			title: _('Syntax Highlighting'),
			subtitle: _('Enable or disable syntax highlighting in the code item'),
		});
		this.add_row(syntaxHighlighting);

		const showLineNumbers = new Adw.SwitchRow({
			title: _('Show Line Numbers'),
			subtitle: _('Show line numbers in the code item'),
		});
		this.add_row(showLineNumbers);

		const showCodeInfo = new Adw.SwitchRow({
			title: _('Show Code Info'),
			subtitle: _('Show extra information in the code item'),
		});
		this.add_row(showCodeInfo);

		const textCounter = new Adw.ComboRow({
			title: _('Text Count Mode'),
			subtitle: _('Show the number of characters, words or lines'),
			model: Gtk.StringList.new([_('Characters'), _('Words'), _('Lines')]),
		});
		this.add_row(textCounter);

		// Bind properties
		const settings = prefs.getSettings().get_child('code-item');
		settings.bind('syntax-highlighting', syntaxHighlighting, 'active', null);
		settings.bind('show-line-numbers', showLineNumbers, 'active', null);
		settings.bind('show-code-info', showCodeInfo, 'active', null);
		bind_enum(settings, 'text-count-mode', textCounter, 'selected');

		makeResettable(textCounter, settings, 'text-count-mode');

		showCodeInfo.bind_property('active', textCounter, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
	}
}
