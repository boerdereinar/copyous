import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { registerClass } from '../../common/gjs.js';
import { bind_enum } from '../../common/settings.js';
import { makeResettable } from '../utils.js';

@registerClass()
export class DialogCustomization extends Adw.PreferencesGroup {
	private readonly _showAtPointer: Adw.SwitchRow;
	private readonly _showAtCursor: Adw.SwitchRow;
	private readonly _orientation: Adw.ComboRow;
	private readonly _horizontal: Gtk.StringList;
	private readonly _horizontalPosition: Adw.ComboRow;
	private readonly _vertical: Gtk.StringList;
	private readonly _verticalPosition: Adw.ComboRow;
	private readonly _size: Adw.SpinRow;

	constructor(prefs: ExtensionPreferences) {
		super({
			title: _('Dialog'),
		});

		const position = new Adw.ExpanderRow({
			title: _('Position'),
			subtitle: _('Change the position of the clipboard dialog'),
		});
		this.add(position);

		this._showAtPointer = new Adw.SwitchRow({
			title: _('Show at Pointer'),
			subtitle: _('Show the clipboard dialog at the pointer position'),
		});
		position.add_row(this._showAtPointer);
		this._showAtPointer.connect('notify::active', this.updateShowAtPointer.bind(this));

		this._showAtCursor = new Adw.SwitchRow({
			title: _('Show at Text Cursor'),
			subtitle: _(
				'Show the clipboard dialog at the text cursor position whenever possible, otherwise at the pointer position',
			),
		});
		position.add_row(this._showAtCursor);

		this._orientation = new Adw.ComboRow({
			title: _('Orientation'),
			subtitle: _('Select the orientation of the clipboard dialog'),
			model: Gtk.StringList.new([_('Horizontal'), _('Vertical')]),
		});
		position.add_row(this._orientation);
		this._orientation.connect('notify::selected', this.updateOrientation.bind(this));

		this._vertical = Gtk.StringList.new([_('Top'), _('Center'), _('Bottom'), _('Fill')]);
		this._verticalPosition = new Adw.ComboRow({
			title: _('Vertical Position'),
			subtitle: _('Select the vertical position of the clipboard dialog'),
			model: this._vertical,
		});
		position.add_row(this._verticalPosition);
		this._verticalPosition.connect('notify::selected', this.updatePosition.bind(this));

		this._horizontal = Gtk.StringList.new([_('Left'), _('Center'), _('Right'), _('Fill')]);
		this._horizontalPosition = new Adw.ComboRow({
			title: _('Horizontal Position'),
			subtitle: _('Select the horizontal position of the clipboard dialog'),
			model: this._horizontal,
		});
		position.add_row(this._horizontalPosition);
		this._horizontalPosition.connect('notify::selected', this.updatePosition.bind(this));

		this._size = new Adw.SpinRow({
			adjustment: new Gtk.Adjustment({ lower: 200, upper: 10000, step_increment: 1, value: 500 }),
		});
		position.add_row(this._size);

		const margins = new Adw.ExpanderRow({
			title: _('Margins'),
			subtitle: _('Change the distance of the dialog from the screen edges'),
		});
		this.add(margins);

		const topMargin = new Adw.SpinRow({
			title: _('Top'),
			subtitle: _('Distance from the top of the screen'),
			adjustment: new Gtk.Adjustment({ lower: 0, upper: 10000, step_increment: 1, value: 6 }),
		});
		margins.add_row(topMargin);

		const rightMargin = new Adw.SpinRow({
			title: _('Right'),
			subtitle: _('Distance from the right of the screen'),
			adjustment: new Gtk.Adjustment({ lower: 0, upper: 10000, step_increment: 1, value: 6 }),
		});
		margins.add_row(rightMargin);

		const bottomMargin = new Adw.SpinRow({
			title: _('Bottom'),
			subtitle: _('Distance from the bottom of the screen'),
			adjustment: new Gtk.Adjustment({ lower: 0, upper: 10000, step_increment: 1, value: 6 }),
		});
		margins.add_row(bottomMargin);

		const leftMargin = new Adw.SpinRow({
			title: _('Left'),
			subtitle: _('Distance from the left of the screen'),
			adjustment: new Gtk.Adjustment({ lower: 0, upper: 10000, step_increment: 1, value: 6 }),
		});
		margins.add_row(leftMargin);

		const autoHideSearch = new Adw.SwitchRow({
			title: _('Auto Hide Search'),
			subtitle: _('Automatically hide the search bar when not focused'),
		});
		this.add(autoHideSearch);

		const showScrollbar = new Adw.SwitchRow({
			title: _('Show Scrollbar'),
			subtitle: _('Show a scrollbar when items overflow'),
		});
		this.add(showScrollbar);

		// Bind properties
		const settings = prefs.getSettings();
		settings.bind('show-at-pointer', this._showAtPointer, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-at-cursor', this._showAtCursor, 'active', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(settings, 'clipboard-orientation', this._orientation, 'selected');
		bind_enum(settings, 'clipboard-position-vertical', this._verticalPosition, 'selected');
		bind_enum(settings, 'clipboard-position-horizontal', this._horizontalPosition, 'selected');
		settings.bind('clipboard-size', this._size, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('clipboard-margin-top', topMargin, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('clipboard-margin-right', rightMargin, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('clipboard-margin-bottom', bottomMargin, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('clipboard-margin-left', leftMargin, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('auto-hide-search', autoHideSearch, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-scrollbar', showScrollbar, 'active', Gio.SettingsBindFlags.DEFAULT);

		makeResettable(
			position,
			settings,
			'show-at-pointer',
			'show-at-cursor',
			'clipboard-orientation',
			'clipboard-position-vertical',
			'clipboard-position-horizontal',
			'clipboard-size',
		);
		makeResettable(
			margins,
			settings,
			'clipboard-margin-top',
			'clipboard-margin-right',
			'clipboard-margin-bottom',
			'clipboard-margin-left',
		);
		makeResettable(topMargin, settings, 'clipboard-margin-top');
		makeResettable(rightMargin, settings, 'clipboard-margin-right');
		makeResettable(bottomMargin, settings, 'clipboard-margin-bottom');
		makeResettable(leftMargin, settings, 'clipboard-margin-left');

		// Update
		this.updateShowAtPointer();
		this.updateOrientation();
		this.updatePosition();
	}

	private updateShowAtPointer() {
		this._horizontalPosition.sensitive = !this._showAtPointer.active;
		this._verticalPosition.sensitive = !this._showAtPointer.active;
		this._showAtCursor.sensitive = this._showAtPointer.active;
		this.updatePosition();
	}

	private updateOrientation() {
		const horizontal = this._orientation.selected === 0;

		// Store current
		const horizontalPosition = this._horizontalPosition.selected;
		const verticalPosition = this._verticalPosition.selected;

		// Enable/disable fill option depending on orientation
		const horizontalFill = this._horizontal.get_item(3) !== null;
		const verticalFill = this._vertical.get_item(3) !== null;
		if (horizontal) {
			if (!horizontalFill) this._horizontal.append(_('Fill'));
			if (verticalFill) this._vertical.remove(3);
		} else {
			if (horizontalFill) this._horizontal.remove(3);
			if (!verticalFill) this._vertical.append(_('Fill'));
		}

		// Switch vertical and horizontal position if fill is selected
		if (horizontal && verticalPosition === 3) {
			this._verticalPosition.selected = horizontalPosition;
			this._horizontalPosition.selected = 3;
		} else if (!horizontal && horizontalPosition === 3) {
			this._horizontalPosition.selected = verticalPosition;
			this._verticalPosition.selected = 3;
		}

		// Update size labels
		if (horizontal) {
			this._size.title = _('Width');
			this._size.subtitle = _('Change the width of the clipboard dialog');
		} else {
			this._size.title = _('Height');
			this._size.subtitle = _('Change the height of the clipboard dialog');
		}
	}

	private updatePosition() {
		const fill = this._verticalPosition.selected === 3 || this._horizontalPosition.selected === 3;
		this._size.sensitive = !fill || this._showAtPointer.active;
	}
}
