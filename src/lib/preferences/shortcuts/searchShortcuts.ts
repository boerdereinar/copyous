import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../prefs.js';
import { registerClass } from '../../common/gjs.js';
import { CopyousSettings } from '../../common/settings.js';
import { ShortcutRow } from './shortcutRow.js';

const ShortcutLabel = ('ShortcutLabel' in Gtk && !('ShortcutLabel' in Adw) ? (Gtk as typeof Adw) : Adw).ShortcutLabel;

@registerClass({
	Properties: {
		'show-ctrl': GObject.ParamSpec.boolean('show-ctrl', null, null, GObject.ParamFlags.READWRITE, true),
	},
})
class ScrollShortcutRow extends Adw.ActionRow {
	private readonly _ctrlLabel: Adw.ShortcutLabel;

	constructor(title: string, showCtrl: boolean) {
		super({ title });

		const box = new Gtk.Box();
		this.add_suffix(box);

		this._ctrlLabel = new ShortcutLabel({ accelerator: '<Ctrl>&', valign: Gtk.Align.CENTER, visible: showCtrl });
		box.append(this._ctrlLabel);

		const scrollLabel = new Gtk.Box({ css_name: 'shortcut-label', valign: Gtk.Align.CENTER });
		box.append(scrollLabel);
		const scrollKeycap = new Gtk.Label({ css_classes: ['keycap'], label: _('Scroll') });
		scrollLabel.append(scrollKeycap);
	}

	get showCtrl() {
		return this._ctrlLabel.visible;
	}

	set showCtrl(value: boolean) {
		this._ctrlLabel.visible = value;
	}
}

@registerClass()
export class SearchShortcuts extends Adw.PreferencesGroup {
	constructor() {
		super({ title: _('Search') });

		this.add(new ShortcutRow(_('Toggle Pinned Search'), '<Alt>'));
		this.add(new ShortcutRow(_('Clear Item Tag/Type'), 'Back'));
		this.add(new ShortcutRow(_('Activate First Item'), 'Return'));
	}
}

@registerClass()
export class SearchNavigationShortcuts extends Adw.PreferencesGroup {
	constructor() {
		super();

		this.add(new ShortcutRow(_('Next Item Type'), '<Ctrl>Tab'));
		this.add(new ShortcutRow(_('Previous Item Type'), '<Ctrl><Shift>Tab'));
		this.add(new ShortcutRow(_('Next Item Tag'), '<Ctrl>grave'));
		this.add(new ShortcutRow(_('Previous Item Tag'), '<Ctrl><Shift>grave'));
		this.add(new ShortcutRow(_('Select Item Tag'), '<Ctrl><Shift>0...9'));
	}
}

@registerClass()
export class SearchScrollShortcuts extends Adw.PreferencesGroup {
	constructor(prefs: Preferences) {
		super();

		const swapScrollRow = new Adw.SwitchRow({
			title: _('Swap Scroll Shortcut'),
			subtitle: _('Swaps scroll shortcuts of cycling item types and item tags'),
		});
		this.add(swapScrollRow);

		const cycleItemTypeRow = new ScrollShortcutRow(_('Cycle Item Type'), swapScrollRow.active);
		this.add(cycleItemTypeRow);
		const cycleItemTagRow = new ScrollShortcutRow(_('Cycle Item Tag'), !swapScrollRow.active);
		this.add(cycleItemTagRow);

		// Bind properties
		swapScrollRow.bind_property('active', cycleItemTypeRow, 'show-ctrl', GObject.BindingFlags.DEFAULT);
		swapScrollRow.bind_property('active', cycleItemTagRow, 'show-ctrl', GObject.BindingFlags.INVERT_BOOLEAN);

		const settings: CopyousSettings = prefs.getSettings();
		settings.bind('swap-scroll-shortcut', swapScrollRow, 'active', null);
	}
}
