import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { registerClass } from '../../common/gjs.js';

type ValueTypes = 'boolean' | 'double' | 'enum' | 'flags' | 'int' | 'string';

abstract class Profile {
	private readonly _settings: Gio.Settings;
	private _values: Map<string, [unknown, ValueTypes] | Map<string, [unknown, ValueTypes]>> = new Map();
	private _invalidValues: Set<string> = new Set();

	private _signals: (() => void)[] = [];

	constructor(prefs: ExtensionPreferences) {
		this._settings = prefs.getSettings();

		this.initProfile();
		this.checkSettings();
	}

	public get active() {
		return this._invalidValues.size === 0;
	}

	protected abstract initProfile(): void;

	protected addSetting(child: string | null, key: string, value: unknown, type: ValueTypes) {
		if (child) {
			let map = this._values.get(child);
			if (!(map instanceof Map)) {
				this._values.set(child, (map = new Map()));
			}

			map.set(key, [value, type]);
		} else {
			this._values.set(key, [value, type]);
		}
	}

	public connectActive(fn: () => void) {
		this._signals.push(fn);
	}

	public activate() {
		this._invalidValues.clear();

		for (const [key, valueOrMap] of this._values) {
			if (valueOrMap instanceof Map) {
				for (const [subkey, [value, type]] of valueOrMap) {
					this.setValue(key, subkey, value, type);
				}
			} else {
				const [value, type] = valueOrMap;
				this.setValue(null, key, value, type);
			}
		}
	}

	private notifyActive() {
		for (const fn of this._signals) fn();
	}

	private checkSettings() {
		for (const [key, valueOrMap] of this._values) {
			if (valueOrMap instanceof Map) {
				for (const [subkey, [value, type]] of valueOrMap) {
					this.checkSetting(key, subkey, value, type);
					this._settings
						.get_child(key)
						.connect(`changed::${subkey}`, () => this.checkSetting(key, subkey, value, type));
				}
			} else {
				const [value, type] = valueOrMap;
				this.checkSetting(null, key, value, type);
				this._settings.connect(`changed::${key}`, () => this.checkSetting(null, key, value, type));
			}
		}
	}

	private checkSetting(child: string | null, key: string, value: unknown, type: ValueTypes): boolean {
		if (this.getValue(child, key, type) === value) {
			if (this._invalidValues.delete(`${child}:${key}`) && this.active) this.notifyActive();
			return true;
		} else {
			this._invalidValues.add(`${child}:${key}`);
			if (this._invalidValues.size === 1) this.notifyActive();
			return false;
		}
	}

	private getValue(child: string | null, key: string, type: ValueTypes): unknown {
		const settings = child ? this._settings.get_child(child) : this._settings;
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
		}
	}

	private setValue(child: string | null, key: string, value: unknown, type: ValueTypes) {
		const settings = child ? this._settings.get_child(child) : this._settings;
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
		this.addSetting(null, 'show-at-pointer', false, 'boolean');
		this.addSetting(null, 'clipboard-orientation', 0, 'enum'); // horizontal
		this.addSetting(null, 'clipboard-position-vertical', 0, 'enum'); // top
		this.addSetting(null, 'clipboard-position-horizontal', 3, 'enum'); // fill
		this.addSetting(null, 'clipboard-size', 500, 'int');
		this.addSetting(null, 'auto-hide-search', false, 'boolean');
		this.addSetting(null, 'item-width', 250, 'int');
		this.addSetting(null, 'item-height', 170, 'int');
		this.addSetting(null, 'dynamic-item-height', false, 'boolean');
		this.addSetting(null, 'show-header', true, 'boolean');
		this.addSetting(null, 'header-controls-visibility', 0, 'enum'); // visible

		this.addSetting('file-item', 'file-preview-visibility', 2, 'enum'); // file-preview-or-file-info

		this.addSetting('link-item', 'link-preview-orientation', 1, 'enum'); // vertical
	}
}

class CompactProfile extends Profile {
	protected override initProfile(): void {
		this.addSetting(null, 'show-at-pointer', true, 'boolean');
		this.addSetting(null, 'clipboard-orientation', 1, 'enum'); // vertical
		this.addSetting(null, 'clipboard-position-vertical', 3, 'enum'); // fill
		this.addSetting(null, 'clipboard-position-horizontal', 0, 'enum'); // left
		this.addSetting(null, 'clipboard-size', 500, 'int');
		this.addSetting(null, 'auto-hide-search', true, 'boolean');
		this.addSetting(null, 'item-width', 300, 'int');
		this.addSetting(null, 'item-height', 100, 'int');
		this.addSetting(null, 'dynamic-item-height', true, 'boolean');
		this.addSetting(null, 'show-header', false, 'boolean');
		this.addSetting(null, 'header-controls-visibility', 1, 'enum'); // visible on hover

		this.addSetting('file-item', 'file-preview-visibility', 1, 'enum'); // file-info

		this.addSetting('link-item', 'link-preview-orientation', 0, 'enum'); // horizontal
	}
}

@registerClass()
export class Profiles extends Adw.PreferencesGroup {
	constructor(prefs: ExtensionPreferences) {
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
