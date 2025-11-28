import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { registerClass } from '../../common/gjs.js';
import { bind_enum } from '../../common/settings.js';
import { makeResettable } from '../utils.js';

@registerClass({
	Properties: {
		color: GObject.ParamSpec.string('color', null, null, GObject.ParamFlags.READWRITE, ''),
	},
})
class ColorRow extends Adw.ActionRow {
	private readonly _colorButton: Gtk.ColorDialogButton;

	constructor(props?: Partial<Adw.ActionRow.ConstructorProps>) {
		super(props);

		this._colorButton = new Gtk.ColorDialogButton({
			valign: Gtk.Align.CENTER,
			dialog: new Gtk.ColorDialog(),
		});
		this.add_suffix(this._colorButton);
		this.activatable_widget = this._colorButton;
		this._colorButton.connect('notify::rgba', () => this.notify('color'));
	}

	get color(): string {
		return this._colorButton.rgba.to_string();
	}

	set color(value: string) {
		const color = new Gdk.RGBA();
		if (color.parse(value)) {
			this._colorButton.rgba = color;
		}
	}
}

const DefaultColors = {
	'custom-bg-color': ['rgb(54,54,58)', 'rgb(250,250,251)'],
	'custom-fg-color': ['rgb(255,255,255)', 'rgb(34,34,38)'],
	'custom-card-bg-color': ['rgb(71,71,76)', 'rgb(255,255,255)'],
	'custom-search-bg-color': ['rgb(71,71,76)', 'rgb(255,255,255)'],
} as const;

function bind_color(settings: Gio.Settings, key: keyof typeof DefaultColors, target: ColorRow) {
	function setColor() {
		const colorScheme = settings.get_enum('custom-color-scheme') as 0 | 1;
		const color = settings.get_string(key);
		target.color = color ? color : DefaultColors[key][colorScheme];
	}

	function getColor() {
		const colorScheme = settings.get_enum('custom-color-scheme') as 0 | 1;
		const color = target.color;
		settings.set_string(key, color === DefaultColors[key][colorScheme] ? '' : color);
	}

	setColor();
	settings.connect('changed::custom-color-scheme', setColor);
	settings.connect(`changed::${key}`, setColor);
	target.connect('notify::color', getColor);
}

@registerClass()
export class ThemeCustomization extends Adw.PreferencesGroup {
	constructor(prefs: ExtensionPreferences) {
		super({
			title: _('Theme'),
		});

		const theme = new Adw.ComboRow({
			title: _('Theme'),
			subtitle: _('Set the preferred theme'),
			model: Gtk.StringList.new([_('System'), _('Dark'), _('Light'), _('Custom')]),
		});
		this.add(theme);
		theme.connect('notify::selected', () => {
			const sensitive = theme.selected === 3;
			colorScheme.sensitive = sensitive;
			bgColor.sensitive = sensitive;
			fgColor.sensitive = sensitive;
			cardBgColor.sensitive = sensitive;
			searchBgColor.sensitive = sensitive;
		});

		const colorScheme = new Adw.ComboRow({
			title: _('Color Scheme'),
			subtitle: _('Set the color scheme of the custom theme'),
			model: Gtk.StringList.new([_('Dark'), _('Light')]),
			sensitive: false,
		});
		this.add(colorScheme);

		const bgColor = new ColorRow({
			title: _('Background Color'),
			subtitle: _('Set the background color of the clipboard dialog'),
			sensitive: false,
		});
		this.add(bgColor);

		const fgColor = new ColorRow({
			title: _('Text Color'),
			subtitle: _('Set the text color of the clipboard dialog'),
			sensitive: false,
		});
		this.add(fgColor);

		const cardBgColor = new ColorRow({
			title: _('Item Color'),
			subtitle: _('Set the background color of clipboard items'),
			sensitive: false,
		});
		this.add(cardBgColor);

		const searchBgColor = new ColorRow({
			title: _('Search Color'),
			subtitle: _('Set the background color of the search bar'),
			sensitive: false,
		});
		this.add(searchBgColor);

		// Bind properties
		const settings = prefs.getSettings();
		bind_enum(settings, 'theme', theme, 'selected');
		bind_enum(settings, 'custom-color-scheme', colorScheme, 'selected');
		bind_color(settings, 'custom-bg-color', bgColor);
		bind_color(settings, 'custom-fg-color', fgColor);
		bind_color(settings, 'custom-card-bg-color', cardBgColor);
		bind_color(settings, 'custom-search-bg-color', searchBgColor);

		makeResettable(bgColor, settings, 'custom-bg-color');
		makeResettable(fgColor, settings, 'custom-fg-color');
		makeResettable(cardBgColor, settings, 'custom-card-bg-color');
		makeResettable(searchBgColor, settings, 'custom-search-bg-color');
	}
}
