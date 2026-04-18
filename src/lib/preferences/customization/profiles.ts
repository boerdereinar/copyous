import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../prefs.js';
import { registerClass } from '../../common/gjs.js';
import {
	ChildKeys,
	FilePreviewVisibility,
	HeaderControlsVisibility,
	Orientation,
	Position,
	Settings,
	SettingsTypes,
	ValueTypes,
} from '../../common/settings.js';

type ValueOf<T> = T[keyof T];

type SettingsKey = Extract<ValueOf<typeof Settings>, string>;
type ChildKey = ValueOf<typeof ChildKeys>;
type ChildKeyMap = {
	[ChildKeys.TextItem]: Extract<ValueOf<typeof Settings.TextItem>, string>;
	[ChildKeys.CodeItem]: Extract<ValueOf<typeof Settings.CodeItem>, string>;
	[ChildKeys.ImageItem]: Extract<ValueOf<typeof Settings.ImageItem>, string>;
	[ChildKeys.FileItem]: Extract<ValueOf<typeof Settings.FileItem>, string>;
	[ChildKeys.LinkItem]: Extract<ValueOf<typeof Settings.LinkItem>, string>;
	[ChildKeys.CharacterItem]: Extract<ValueOf<typeof Settings.CharacterItem>, string>;
	[ChildKeys.Theme]: Extract<ValueOf<typeof Settings.Theme>, string>;
};

type SettingsMap = Partial<Record<SettingsKey, unknown>> & {
	[K in ChildKey]?: Partial<Record<ChildKeyMap[K], unknown>>;
};

abstract class Profile {
	private readonly _settings: Gio.Settings;
	private _values: SettingsMap = {};
	private _invalidValues: Set<string> = new Set();

	private _signals: (() => void)[] = [];

	constructor(prefs: Preferences) {
		this._settings = prefs.getSettings();

		this.initProfile();
		this.checkSettings();
	}

	public get active() {
		return this._invalidValues.size === 0;
	}

	protected abstract initProfile(): void;

	protected addSetting<K extends SettingsKey>(child: null, key: K, value: unknown): void;
	protected addSetting<C extends ChildKey, K extends ChildKeyMap[C]>(child: C, key: K, value: unknown): void;
	protected addSetting(child: ChildKey | null, key: string, value: unknown) {
		if (child) {
			this._values[child] ??= {};
			const values = this._values[child] as Partial<Record<string, unknown>>;
			values[key] = value;
		} else {
			this._values[key as SettingsKey] = value;
		}
	}

	public connectActive(fn: () => void) {
		this._signals.push(fn);
	}

	public activate() {
		this._invalidValues.clear();

		for (const [key, valueOrChild] of Object.entries(this._values)) {
			if (typeof valueOrChild === 'object' && !Array.isArray(valueOrChild)) {
				for (const [subkey, value] of Object.entries(valueOrChild as object)) {
					this.setValue(key as ChildKey, subkey, value);
				}
			} else {
				this.setValue(null, key, valueOrChild);
			}
		}
	}

	private notifyActive() {
		for (const fn of this._signals) fn();
	}

	private checkSettings() {
		for (const [key, valueOrChild] of Object.entries(this._values)) {
			if (typeof valueOrChild === 'object' && !Array.isArray(valueOrChild)) {
				const child = this._settings.get_child(key);
				for (const [subkey, value] of Object.entries(valueOrChild as object)) {
					this.checkSetting(key as ChildKey, subkey, value);
					child.connect(`changed::${subkey}`, () => this.checkSetting(key as ChildKey, subkey, value));
				}
			} else {
				this.checkSetting(null, key, valueOrChild);
				this._settings.connect(`changed::${key}`, () => this.checkSetting(null, key, valueOrChild));
			}
		}
	}

	private checkSetting(child: ChildKey | null, key: string, value: unknown): boolean {
		if (this.getValue(child, key) === value) {
			if (this._invalidValues.delete(`${child}:${key}`) && this.active) this.notifyActive();
			return true;
		} else {
			this._invalidValues.add(`${child}:${key}`);
			if (this._invalidValues.size === 1) this.notifyActive();
			return false;
		}
	}

	private getValue(child: ChildKey | null, key: string): unknown {
		const settings = child ? this._settings.get_child(child) : this._settings;
		const type = (child ? SettingsTypes[child][key as never] : SettingsTypes[key as SettingsKey]) as ValueTypes;
		switch (type) {
			case 'boolean':
				return settings.get_boolean(key);
			case 'double':
				return settings.get_double(key);
			case 'enum':
				return settings.get_enum(key);
			case 'flags':
				return settings.get_flags(key);
			case 'int':
				return settings.get_int(key);
			case 'string':
				return settings.get_string(key);
			case 'strv':
				return settings.get_strv(key);
		}
	}

	private setValue(child: ChildKey | null, key: string, value: unknown): void {
		const settings = child ? this._settings.get_child(child) : this._settings;
		const type = (child ? SettingsTypes[child][key as never] : SettingsTypes[key as SettingsKey]) as ValueTypes;
		switch (type) {
			case 'boolean':
				settings.set_boolean(key, value as boolean);
				break;
			case 'double':
				settings.set_double(key, value as number);
				break;
			case 'enum':
				settings.set_enum(key, value as number);
				break;
			case 'flags':
				settings.set_flags(key, value as number);
				break;
			case 'int':
				settings.set_int(key, value as number);
				break;
			case 'string':
				settings.set_string(key, value as string);
				break;
		}
	}
}

class DefaultProfile extends Profile {
	protected override initProfile(): void {
		this.addSetting(null, 'show-at-pointer', false);
		this.addSetting(null, 'clipboard-orientation', Orientation.Horizontal);
		this.addSetting(null, 'clipboard-position-vertical', Position.Top);
		this.addSetting(null, 'clipboard-position-horizontal', Position.Fill);
		this.addSetting(null, 'clipboard-size', 500);
		this.addSetting(null, 'auto-hide-search', false);
		this.addSetting(null, 'item-width', 250);
		this.addSetting(null, 'item-height', 170);
		this.addSetting(null, 'dynamic-item-height', false);
		this.addSetting(null, 'show-header', true);
		this.addSetting(null, 'header-controls-visibility', HeaderControlsVisibility.Visible);

		this.addSetting('file-item', 'file-preview-visibility', FilePreviewVisibility.FilePreviewOrFileInfo);

		this.addSetting('link-item', 'link-preview-orientation', Orientation.Vertical);
	}
}

class CompactProfile extends Profile {
	protected override initProfile(): void {
		this.addSetting(null, 'show-at-pointer', true);
		this.addSetting(null, 'clipboard-orientation', Orientation.Vertical);
		this.addSetting(null, 'clipboard-position-vertical', Position.Fill);
		this.addSetting(null, 'clipboard-position-horizontal', Position.Left);
		this.addSetting(null, 'clipboard-size', 500);
		this.addSetting(null, 'auto-hide-search', true);
		this.addSetting(null, 'item-width', 300);
		this.addSetting(null, 'item-height', 100);
		this.addSetting(null, 'dynamic-item-height', true);
		this.addSetting(null, 'show-header', false);
		this.addSetting(null, 'header-controls-visibility', HeaderControlsVisibility.VisibleOnHover);

		this.addSetting('file-item', 'file-preview-visibility', FilePreviewVisibility.FileInfoOnly);

		this.addSetting('link-item', 'link-preview-orientation', Orientation.Horizontal);
	}
}

@registerClass()
export class Profiles extends Adw.PreferencesGroup {
	constructor(prefs: Preferences) {
		super({
			title: _('Profiles'),
			description: _('Choose between pre-defined profiles'),
		});

		const toggles = new Adw.ToggleGroup();
		this.add(toggles);

		const defaultToggle = new Adw.Toggle({
			name: 'default',
			label: _('Default'),
		});
		toggles.add(defaultToggle);

		const compactToggle = new Adw.Toggle({
			name: 'compact',
			label: _('Compact'),
		});
		toggles.add(compactToggle);

		const customToggle = new Adw.Toggle({
			name: 'custom',
			label: _('Custom'),
		});
		toggles.add(customToggle);

		const defaultProfile = new DefaultProfile(prefs);
		const compactProfile = new CompactProfile(prefs);

		// Set current active profile
		if (defaultProfile.active) toggles.set_active_name('default');
		else if (compactProfile.active) toggles.set_active_name('compact');
		else toggles.set_active_name('custom');

		// Update active profile
		toggles.connect('notify::active-name', () => {
			if (toggles.active_name === 'default' && !defaultProfile.active) {
				defaultProfile.activate();
			} else if (toggles.active_name === 'compact' && !compactProfile.active) {
				compactProfile.activate();
			}
		});

		// Check if profile is active
		defaultProfile.connectActive(() => {
			if (defaultProfile.active) {
				toggles.set_active_name('default');
			} else if (toggles.active_name === 'default') {
				toggles.set_active_name('custom');
			}
		});

		compactProfile.connectActive(() => {
			if (compactProfile.active) {
				toggles.set_active_name('compact');
			} else if (toggles.active_name === 'compact') {
				toggles.set_active_name('custom');
			}
		});
	}
}
