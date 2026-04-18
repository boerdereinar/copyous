import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { registerClass } from '../common/gjs.js';
import { Icon } from '../common/icons.js';
import { KeysWithValue, SettingsKeys, TypedSettings } from '../common/settings.js';

@registerClass({
	Properties: {
		listbox: GObject.ParamSpec.object('listbox', null, null, GObject.ParamFlags.READABLE, Gtk.ListBox),
	},
})
export class NestedListBox extends Adw.PreferencesRow {
	private readonly _listbox: Gtk.ListBox;

	constructor() {
		super({
			css_classes: ['nested-list-row'],
			focusable: false,
			activatable: false,
		});

		this._listbox = new Gtk.ListBox({
			css_classes: ['boxed-list', 'nested-list'],
			selection_mode: Gtk.SelectionMode.NONE,
		});
		this.child = this._listbox;

		this._listbox.connect('keynav-failed', this.keynav_failed_cb.bind(this));
	}

	get listbox() {
		return this._listbox;
	}

	private keynav_failed_cb(_widget: Gtk.Widget, direction: Gtk.DirectionType): boolean {
		if (direction !== Gtk.DirectionType.UP && direction !== Gtk.DirectionType.DOWN) return false;

		const dir = direction === Gtk.DirectionType.UP ? Gtk.DirectionType.TAB_BACKWARD : Gtk.DirectionType.TAB_FORWARD;
		return this.root.child_focus(dir);
	}
}

interface Row {
	add_suffix(child: Gtk.Widget): void;
}

export function makeResettable<
	TRow extends Row,
	T,
	TEnum extends { [K in KeysWithValue<T, 'enum'> | KeysWithValue<T, 'flags'>]: unknown },
>(row: TRow, settings: TypedSettings<T, TEnum>, ...keys: SettingsKeys<T>[]): TRow {
	const defaultValues = keys.map((key) => settings.get_default_value(key));
	if (defaultValues.some((value) => value === null)) return row;

	function isDefault() {
		return keys.every((key, i) => settings.get_value(key).equal(defaultValues[i]!));
	}

	const separator = new Gtk.Separator({
		orientation: Gtk.Orientation.VERTICAL,
		margin_top: 9,
		margin_bottom: 9,
		margin_start: 6,
	});
	row.add_suffix(separator);

	if (row instanceof Adw.ExpanderRow) {
		separator.margin_start = 0;
		separator.margin_end = 6;
	}

	const resetButton = new Gtk.Button({
		icon_name: Icon.Undo,
		valign: Gtk.Align.CENTER,
		css_classes: ['flat'],
		sensitive: !isDefault(),
	});
	row.add_suffix(resetButton);

	resetButton.connect('clicked', () => keys.forEach((key) => settings.reset(key)));

	for (const key of keys) {
		settings.connect(`changed::${key}`, () => (resetButton.sensitive = !isDefault()));
	}

	return row;
}
