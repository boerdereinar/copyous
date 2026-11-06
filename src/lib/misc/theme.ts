import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import CopyousExtension from '../../extension.js';
import { DefaultColors, getDataPath } from '../common/constants.js';
import { enumParamSpec, registerClass } from '../common/gjs.js';
import { ColorScheme, CustomColorScheme, Theme, ThemeSettings } from '../common/settings.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');

@registerClass({
	Properties: {
		'color-scheme': enumParamSpec(
			'color-scheme',
			GObject.ParamFlags.READABLE,
			CustomColorScheme,
			CustomColorScheme.Dark,
		),
	},
})
export class ThemeManager extends GObject.Object {
	private readonly _resource: Gio.Resource;
	private readonly _themeSettings: ThemeSettings;
	private readonly _settings: St.Settings;

	private _stylesheet: Gio.File | null = null;
	private _colorScheme: CustomColorScheme = CustomColorScheme.Dark;

	constructor(private ext: CopyousExtension) {
		super();

		this._resource = Gio.resource_load(`${this.ext.path}/theme.gresource`);
		Gio.resources_register(this._resource);

		this._themeSettings = this.ext.settings.get_child('theme');
		this._themeSettings.connectObject('changed', this.updateTheme.bind(this), this);

		this._settings = St.Settings.get();

		this._settings.connectObject(
			'notify::high-contrast',
			this.updateTheme.bind(this),
			'notify::color-scheme',
			this.updateTheme.bind(this),
			this,
		);
		this.theme.connectObject(
			'notify::theme-stylesheet',
			this.styleSheetChanged.bind(this),
			'notify::default-stylesheet',
			this.styleSheetChanged.bind(this),
			this,
		);

		this.updateTheme().catch(() => {});
	}

	private get theme(): St.Theme {
		return St.ThemeContext.get_for_stage(global.stage).get_theme();
	}

	get colorScheme(): CustomColorScheme {
		return this._colorScheme;
	}

	private set colorScheme(scheme: CustomColorScheme) {
		if (scheme === this._colorScheme) return;

		this._colorScheme = scheme;
		this.notify('color-scheme');
	}

	destroy() {
		if (this._stylesheet) this.theme.unload_stylesheet(this._stylesheet);
		this._stylesheet = null;
		Gio.resources_unregister(this._resource);
		this._themeSettings.disconnectObject(this);
		this._settings.disconnectObject(this);
		this.theme.disconnectObject(this);
	}

	private async styleSheetChanged() {
		const theme = this._themeSettings.get_enum('theme');
		if (theme === Theme.Auto) {
			await this.updateTheme();
		}
	}

	private async updateTheme() {
		let theme = this._themeSettings.get_enum('theme');

		this.colorScheme = (() => {
			if (theme === Theme.Custom) {
				return this._themeSettings.get_enum('custom-color-scheme');
			}

			const colorScheme = this._themeSettings.get_enum('color-scheme');
			if (colorScheme === ColorScheme.System) {
				return this._settings.high_contrast
					? CustomColorScheme.HighContrast
					: Main.getStyleVariant() === 'light'
						? CustomColorScheme.Light
						: CustomColorScheme.Dark;
			} else {
				return (colorScheme - 1) as CustomColorScheme;
			}
		})();

		// Custom Theme
		if (theme === Theme.Custom) {
			const colors = Object.fromEntries(
				Object.entries(DefaultColors).map(([key, c]) => {
					const i = Math.min(this.colorScheme, c.length - 1);
					let color = this._themeSettings.get_string(key as keyof typeof DefaultColors);
					color = color ? color : c[i]!;

					return [key, color];
				}),
			) as Record<keyof typeof DefaultColors, string>;

			const success = await this.loadCustomTheme(colors);
			if (success) return;

			theme = Theme.Default;
		}

		// Automatic theme
		if (theme === Theme.Auto) {
			const colors = this.detectThemeColors();
			const success = await this.loadCustomTheme(colors);
			if (success) return;

			theme = Theme.Default;
		}

		// GNOME Theme
		const colorScheme = (['dark', 'light', 'high-contrast'] as const)[this.colorScheme];
		const themeName = (['default', 'yaru'] as const)[theme];
		const uri = `resource:///org/gnome/shell/extensions/copyous/css/stylesheet-${themeName}-${colorScheme}.css`;
		const stylesheet = Gio.File.new_for_uri(uri);

		if (this._stylesheet?.equal(stylesheet)) return;

		try {
			if (this._stylesheet) this.theme.unload_stylesheet(this._stylesheet);
			this.theme.load_stylesheet(stylesheet);
			this._stylesheet = stylesheet;
		} catch (err) {
			this.ext.logger.error(err);
		}
	}

	private async loadCustomTheme(colors: Record<keyof typeof DefaultColors, string>): Promise<boolean> {
		const colorScheme = (['dark', 'light', 'high-contrast'] as const)[this.colorScheme];

		try {
			// Load template
			const uri = `resource:///org/gnome/shell/extensions/copyous/css/template-${colorScheme}.css`;
			const template = Gio.File.new_for_uri(uri);
			const [contents] = await template.load_contents_async(null);
			const text = new TextDecoder().decode(contents);

			// Fill template
			const css = Object.entries(colors).reduce((s, [key, color]) => {
				// custom-var-foo-bar -> var_foo_bar
				const variable = key.substring('custom-'.length).replace(/-/g, '_');
				return s.replaceAll(`$${variable}`, color);
			}, text);

			// Save theme
			const path = getDataPath(this.ext);
			const stylesheet = path.get_child('custom-theme.css');

			const bytes = new TextEncoder().encode(css);
			await stylesheet.replace_contents_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

			// Load theme
			if (this._stylesheet) this.theme.unload_stylesheet(this._stylesheet);
			this.theme.load_stylesheet(stylesheet);
			this._stylesheet = stylesheet;
			return true;
		} catch (err) {
			this.ext.logger.error(err);
			return false;
		}
	}

	private detectThemeColors(): Record<keyof typeof DefaultColors, string> {
		const getBg = (node: St.ThemeNode) => node.get_background_color();
		const getFg = (node: St.ThemeNode) => node.get_foreground_color();

		const bgColor = this.detectColor(['popup-menu', 'popup-menu-content'], getBg);
		const fgColor = this.detectColor(['popup-menu', 'popup-menu-content'], getFg);
		const cardBgColor = this.detectColor(['message-list', 'message'], getBg);

		return {
			'custom-bg-color': bgColor,
			'custom-fg-color': fgColor,
			'custom-card-bg-color': cardBgColor,
			'custom-search-bg-color': cardBgColor,
		};
	}

	private detectColor(classes: string[], fn: (node: St.ThemeNode) => Cogl.Color): string {
		const context = St.ThemeContext.get_for_stage(global.stage);

		let node = context.get_root_node();
		for (const clazz of classes) {
			node = St.ThemeNode.new(context, node, null, Clutter.Actor.$gtype, null, clazz, null, '');
		}

		const color = fn(node);
		return `rgb(${color.red},${color.green},${color.blue},${color.alpha / 255})`;
	}
}
