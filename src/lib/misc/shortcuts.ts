import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type CopyousExtension from '../../extension.js';
import { instanceofAction, instanceofActionSubmenu, loadConfig } from '../common/actions.js';
import { getActionsConfigPath } from '../common/constants.js';
import { registerClass } from '../common/gjs.js';

export const Shortcut = {
	Open: 'open-clipboard-dialog-shortcut',
	Incognito: 'toggle-incognito-mode-shortcut',

	Pin: 'pin-item-shortcut',
	Delete: 'delete-item-shortcut',
	Edit: 'edit-item-shortcut',
	EditTitle: 'edit-title-shortcut',
	Menu: 'open-menu-shortcut',
} as const;

export type Shortcut = (typeof Shortcut)[keyof typeof Shortcut];

@registerClass({
	Properties: {
		shortcuts: GObject.ParamSpec.boxed('shortcuts', null, null, GObject.ParamFlags.READWRITE, GLib.strv_get_type()),
	},
})
class ShortcutBinding extends GObject.Object {
	private _shortcuts: string[] = [];

	constructor(settings: Gio.Settings, key: Shortcut) {
		super();

		settings.bind(key, this, 'shortcuts', Gio.SettingsBindFlags.DEFAULT);
	}

	public get shortcuts(): string[] {
		return this._shortcuts;
	}

	public set shortcuts(value: string[]) {
		this._shortcuts = value;
		this.notify('shortcuts');
	}
}

@registerClass({
	Properties: {
		shift: GObject.ParamSpec.boolean('shift', null, null, GObject.ParamFlags.READABLE, false),
	},
	Signals: {
		'open-clipboard-dialog': {},
		'toggle-incognito-mode': {},
	},
})
export class ShortcutManager extends GObject.Object {
	private _actor: Clutter.Actor | null;
	private _keyPressSignalId: number = -1;
	private _keyReleaseSignalId: number = -1;
	private _destroySignalId: number = -1;

	private _shortcuts: { [shortcut in Shortcut]?: ShortcutBinding } = {};
	private _actions: { [shortcut in string]: string } = {};
	private _shiftL: boolean = false;
	private _shiftR: boolean = false;

	private _monitor: Gio.FileMonitor;

	constructor(
		private ext: CopyousExtension,
		actor: Clutter.Actor,
	) {
		super();

		this.registerGlobalShortcut(Shortcut.Open, 'open-clipboard-dialog');
		this.registerGlobalShortcut(Shortcut.Incognito, 'toggle-incognito-mode');

		this.registerShortcut(Shortcut.Pin);
		this.registerShortcut(Shortcut.Delete);
		this.registerShortcut(Shortcut.Edit);
		this.registerShortcut(Shortcut.EditTitle);
		this.registerShortcut(Shortcut.Menu);

		this._actor = actor;
		this._keyPressSignalId = actor.connect('key-press-event', this.keyPressEvent.bind(this));
		this._keyReleaseSignalId = actor.connect('key-release-event', this.keyReleaseEvent.bind(this));
		this._destroySignalId = actor.connect('destroy', () => (this._actor = null));

		this._monitor = getActionsConfigPath(ext).monitor(Gio.FileMonitorFlags.NONE, null);
		this._monitor.connect('changed', (_source, _file, _otherFile, eventType) => {
			if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
				this.updateActions();
			}
		});
		this.updateActions(true);
	}

	private registerGlobalShortcut(key: Shortcut, signal: string) {
		Main.wm.addKeybinding(key, this.ext.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, () =>
			this.emit(signal),
		);
	}

	private unregisterGlobalShortcut(key: Shortcut) {
		Main.wm.removeKeybinding(key);
	}

	private registerShortcut(key: Shortcut) {
		this._shortcuts[key] = new ShortcutBinding(this.ext.settings, key);
	}

	private keyPressEvent(_actor: Clutter.Actor, event: Clutter.Event) {
		const key = event.get_key_symbol();
		if (key === Clutter.KEY_Shift_L) {
			this._shiftL = true;
			this.notify('shift');
		} else if (key === Clutter.KEY_Shift_R) {
			this._shiftR = true;
			this.notify('shift');
		}
	}

	private keyReleaseEvent(_actor: Clutter.Actor, event: Clutter.Event) {
		const key = event.get_key_symbol();
		if (key === Clutter.KEY_Shift_L) {
			this._shiftL = false;
			this.notify('shift');
		} else if (key === Clutter.KEY_Shift_R) {
			this._shiftR = false;
			this.notify('shift');
		}
	}

	private updateActions(save: boolean = false) {
		this._actions = {};

		const actions = loadConfig(this.ext, save);
		for (const action of actions.actions) {
			if (instanceofActionSubmenu(action)) {
				for (const subAction of action.actions) {
					for (const shortcut of subAction.shortcut ?? []) {
						this._actions[shortcut] = subAction.id;
					}
				}
			} else if (instanceofAction(action)) {
				for (const shortcut of action.shortcut ?? []) {
					this._actions[shortcut] = action.id;
				}
			}
		}
	}

	get shift(): boolean {
		return this._shiftL || this._shiftR;
	}

	public getShortcutForKeyBinding(keyval: number, mask: Clutter.ModifierType): Shortcut | null {
		const accelerator = Meta.accelerator_name(mask, keyval);
		for (const [key, binding] of Object.entries(this._shortcuts)) {
			if (binding.shortcuts.includes(accelerator)) return key as Shortcut;
		}
		return null;
	}

	public getActionForKeyBinding(keyval: number, mask: Clutter.ModifierType): string | null {
		const accelerator = Meta.accelerator_name(mask, keyval);
		return this._actions[accelerator] ?? null;
	}

	public destroy(): void {
		this.unregisterGlobalShortcut(Shortcut.Open);
		this.unregisterGlobalShortcut(Shortcut.Incognito);

		this._shortcuts = {};

		if (this._actor) {
			if (this._keyPressSignalId >= 0) this._actor.disconnect(this._keyPressSignalId);
			if (this._keyReleaseSignalId >= 0) this._actor.disconnect(this._keyReleaseSignalId);
			if (this._destroySignalId >= 0) this._actor.disconnect(this._destroySignalId);
		}

		this._keyPressSignalId = -1;
		this._keyReleaseSignalId = -1;
		this._destroySignalId = -1;
		this._monitor.cancel();
	}
}
