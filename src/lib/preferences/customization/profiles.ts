import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

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

		const box = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			homogeneous: true,
			css_classes: ['linked'],
		});
		this.add(box);

		const defaultToggle = new Gtk.ToggleButton({ label: _('Default') });
		box.append(defaultToggle);

		const compactToggle = new Gtk.ToggleButton({ label: _('Compact'), group: defaultToggle });
		box.append(compactToggle);

		const customToggle = new Gtk.ToggleButton({ label: _('Custom'), group: defaultToggle });
		box.append(customToggle);

		const defaultProfile = new DefaultProfile(prefs);
		const compactProfile = new CompactProfile(prefs);

		let _activeName = 'custom';
		const setActive = (name: string) => {
			_activeName = name;
			if (name === 'default') defaultToggle.active = true;
			else if (name === 'compact') compactToggle.active = true;
			else customToggle.active = true;
		};

		// Set current active profile
		if (defaultProfile.active) setActive('default');
		else if (compactProfile.active) setActive('compact');
		else setActive('custom');

		// Update active profile
		const onToggled = () => {
			const newName = defaultToggle.active ? 'default' : compactToggle.active ? 'compact' : 'custom';
			if (newName === _activeName) return;
			_activeName = newName;
			if (newName === 'default' && !defaultProfile.active) {
				defaultProfile.activate();
			} else if (newName === 'compact' && !compactProfile.active) {
				compactProfile.activate();
			}
		};
		defaultToggle.connect('toggled', onToggled);
		compactToggle.connect('toggled', onToggled);
		customToggle.connect('toggled', onToggled);

		// Check if profile is active
		defaultProfile.connectActive(() => {
			if (defaultProfile.active) {
				setActive('default');
			} else if (_activeName === 'default') {
				setActive('custom');
			}
		});

		compactProfile.connectActive(() => {
			if (compactProfile.active) {
				setActive('compact');
			} else if (_activeName === 'compact') {
				setActive('custom');
			}
		});
	}
}
