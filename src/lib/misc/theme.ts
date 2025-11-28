import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';

import CopyousExtension from '../../extension.js';
import { getDataPath } from '../common/constants.js';
import { enumParamSpec, registerClass } from '../common/gjs.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');

export const Theme = {
	System: 0,
	Dark: 1,
	Light: 2,
	Custom: 3,
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

export const ColorScheme = {
	Dark: 0,
	Light: 1,
} as const;

export type ColorScheme = (typeof ColorScheme)[keyof typeof ColorScheme];

const DefaultColors = {
	'custom-bg-color': ['rgb(54,54,58)', 'rgb(250,250,251)'],
	'custom-fg-color': ['rgb(255,255,255)', 'rgb(34,34,38)'],
	'custom-card-bg-color': ['rgb(71,71,76)', 'rgb(255,255,255)'],
	'custom-search-bg-color': ['rgb(71,71,76)', 'rgb(255,255,255)'],
} as const;

@registerClass({
	Properties: {
		'color-scheme': enumParamSpec('color-scheme', GObject.ParamFlags.READABLE, ColorScheme, ColorScheme.Dark),
	},
})
export class ThemeManager extends GObject.Object {
	private readonly _resource: Gio.Resource;
	private readonly _theme: St.Theme;
	private readonly _settings: St.Settings;
	private readonly _colorSchemeChangedId: number;

	private _stylesheet: Gio.File | null = null;
	private _colorScheme: ColorScheme = ColorScheme.Dark;

	constructor(private ext: CopyousExtension) {
		super();

		this._resource = Gio.resource_load(`${this.ext.path}/theme.gresource`);
		Gio.resources_register(this._resource);

		this.ext.settings.connectObject(
			'changed::theme',
			this.updateTheme.bind(this),
			'changed::custom-color-scheme',
			this.updateTheme.bind(this),
			'changed::custom-bg-color',
			this.updateTheme.bind(this),
			'changed::custom-fg-color',
			this.updateTheme.bind(this),
			'changed::custom-card-bg-color',
			this.updateTheme.bind(this),
			'changed::custom-search-bg-color',
			this.updateTheme.bind(this),
			this,
		);

		this._theme = St.ThemeContext.get_for_stage(global.stage).get_theme();

		this._settings = St.Settings.get();
		this._colorSchemeChangedId = this._settings.connect('notify::color-scheme', this.updateTheme.bind(this));

		this.updateTheme().catch(() => {});
	}

	get colorScheme(): ColorScheme {
		return this._colorScheme;
	}

	private set colorScheme(scheme: ColorScheme) {
		if (scheme === this._colorScheme) return;

		this._colorScheme = scheme;
		this.notify('color-scheme');
	}

	destroy() {
		Gio.resources_unregister(this._resource);
		this.ext.settings.disconnectObject(this);
		this._settings.disconnect(this._colorSchemeChangedId);
	}

	private async updateTheme() {
		const theme = this.ext.settings.get_enum('theme') as Theme;

		const systemColorScheme: ColorScheme =
			this._settings.get_color_scheme() === St.SystemColorScheme.PREFER_LIGHT
				? ColorScheme.Light
				: ColorScheme.Dark;
		const customColorScheme: ColorScheme = this.ext.settings.get_enum('custom-color-scheme') as ColorScheme;

		this.colorScheme = (() => {
			switch (theme) {
				case Theme.System:
					return systemColorScheme;
				case Theme.Dark:
					return ColorScheme.Dark;
				case Theme.Light:
					return ColorScheme.Light;
				case Theme.Custom:
					return customColorScheme;
			}
		})();

		let colorScheme = this.colorScheme === ColorScheme.Dark ? 'dark' : 'light';

		// Custom Theme
		if (theme === Theme.Custom) {
			try {
				// Load template
				const uri = `resource:///org/gnome/shell/extensions/copyous/template-${colorScheme}.css`;
				const template = Gio.File.new_for_uri(uri);
				const [contents] = await template.load_contents_async(null);
				const text = new TextDecoder().decode(contents);

				// Fill template
				const i = this.colorScheme;

				let bgColor = this.ext.settings.get_string('custom-bg-color');
				bgColor = bgColor ? bgColor : DefaultColors['custom-bg-color'][i];
				let fgColor = this.ext.settings.get_string('custom-fg-color');
				fgColor = fgColor ? fgColor : DefaultColors['custom-fg-color'][i];
				let cardBgColor = this.ext.settings.get_string('custom-card-bg-color');
				cardBgColor = cardBgColor ? cardBgColor : DefaultColors['custom-card-bg-color'][i];
				let searchBgColor = this.ext.settings.get_string('custom-search-bg-color');
				searchBgColor = searchBgColor ? searchBgColor : DefaultColors['custom-search-bg-color'][i];

				const css = text
					.replace(/\$bg_color/g, bgColor)
					.replace(/\$fg_color/g, fgColor)
					.replace(/\$card_bg_color/g, cardBgColor)
					.replace(/\$search_bg_color/g, searchBgColor);

				// Save theme
				const path = getDataPath(this.ext);
				const stylesheet = path.get_child('custom-theme.css');

				const bytes = new TextEncoder().encode(css);
				await stylesheet.replace_contents_async(
					bytes,
					null,
					false,
					Gio.FileCreateFlags.REPLACE_DESTINATION,
					null,
				);

				// Load theme
				if (this._stylesheet) this._theme.unload_stylesheet(this._stylesheet);
				this._theme.load_stylesheet(stylesheet);
				this._stylesheet = stylesheet;
				return;
			} catch (err) {
				this.ext.logger.error(err);

				// Fallback to default dark theme
				colorScheme = 'dark';
			}
		}

		// GNOME Theme
		const uri = `resource:///org/gnome/shell/extensions/copyous/stylesheet-${colorScheme}.css`;
		const stylesheet = Gio.File.new_for_uri(uri);

		if (this._stylesheet?.equal(stylesheet)) return;

		try {
			if (this._stylesheet) this._theme.unload_stylesheet(this._stylesheet);
			this._theme.load_stylesheet(stylesheet);
			this._stylesheet = stylesheet;
		} catch (err) {
			this.ext.logger.error(err);
		}
	}
}
