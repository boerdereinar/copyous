import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type CopyousExtension from '../../../extension.js';
import {
	Action,
	ActionConfig,
	ActionOutput,
	ActionSubmenu,
	ColorAction,
	CommandAction,
	QrCodeAction,
	findActionById,
	findDefaultAction,
	instanceofAction,
	instanceofActionSubmenu,
	instanceofColorAction,
	instanceofCommandAction,
	instanceofQrCodeAction,
	isDefaultAction,
	loadConfig,
	matchAction,
	testAction,
} from '../../common/actions.js';
import { Color } from '../../common/color.js';
import { getActionsConfigPath } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { ClipboardEntry } from '../../misc/db.js';
import { trim } from './label.js';
import { QrCodeDialog } from './qrCodeDialog.js';
import { ShortcutLabel } from './shortcutLabel.js';

Gio._promisify(Gio.Subprocess.prototype, 'wait_async');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

@registerClass({
	Signals: {
		run: { param_types: [GObject.TYPE_JSOBJECT] },
	},
})
class ActionSubmenuMenuItem extends PopupMenu.PopupSubMenuMenuItem {
	private readonly menuActions: ActionMenuItem[];

	constructor(action: ActionSubmenu) {
		super(action.name);
		this.menu.actor.add_style_class_name('clipboard-action-submenu');
		this.menu.box.add_style_class_name('popup-sub-menu'); // Workaround for bad animation

		this.menuActions = action.actions.map((a) => new ActionMenuItem(a));
		for (const a of this.menuActions) {
			this.menu.addMenuItem(a);
			a.connect('run', (_action, act: Action) => this.emit('run', act));
		}

		this.menu.connectObject('activate', () => this.emit('activate', Clutter.get_current_event()), this);
	}

	update(config: ActionConfig, entry: ClipboardEntry): boolean {
		this.visible = this.menuActions.map((a) => a.update(config, entry)).some((v) => v);
		return this.visible;
	}
}

@registerClass({
	Signals: {
		run: { param_types: [GObject.TYPE_JSOBJECT] },
	},
})
class ActionMenuItem extends PopupMenu.PopupMenuItem {
	declare _ornamentIcon: St.Icon;
	private readonly _shortcutLabel: ShortcutLabel;

	constructor(private action: Action) {
		super(action.name);

		this.set_child_above_sibling(this._ornamentIcon, this.label);
		this._ornamentIcon.x_align = Clutter.ActorAlign.END;
		this._ornamentIcon.x_expand = true;

		this._shortcutLabel = new ShortcutLabel(action.shortcut?.[0] ?? '', {
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.END,
			y_align: Clutter.ActorAlign.CENTER,
			opacity: 180,
		});
		this.add_child(this._shortcutLabel);
	}

	on_activate() {
		this.emit('run', this.action);
	}

	update(config: ActionConfig, entry: ClipboardEntry): boolean {
		const defaultAction = isDefaultAction(config, entry, this.action);
		this.setOrnament(defaultAction ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.HIDDEN);
		this._shortcutLabel.visible = !defaultAction;

		this.visible = testAction(entry, this.action);
		return this.visible;
	}
}

export type ActionPopupMenuSectionSignals = {
	'open-state-changed': [boolean];
	'actions-changed': [];
	'activate': [Clutter.Event];
	'copy': [string];
	'paste': [string];
};

export class ActionPopupMenuSection extends PopupMenu.PopupMenuSection<ActionPopupMenuSectionSignals> {
	private _config: ActionConfig;
	private _entry: ClipboardEntry | null = null;
	private _menuActions: (ActionMenuItem | ActionSubmenuMenuItem)[];

	private _monitor: Gio.FileMonitor;
	private _tokens: Gio.Cancellable[] = [];

	constructor(private ext: CopyousExtension) {
		super();

		this._config = { actions: [] };
		this._menuActions = [];

		this._monitor = getActionsConfigPath(ext).monitor(Gio.FileMonitorFlags.NONE, null);
		this._monitor.connect('changed', (_source, _file, _otherFile, eventType) => {
			if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
				this.updateActions();
			}
		});
		this.updateActions(true);
	}

	set entry(entry: ClipboardEntry) {
		this._menuActions.forEach((a) => a.update(this._config, entry));
		this._entry = entry;
	}

	private updateActions(save: boolean = false) {
		this._config = loadConfig(this.ext, save);

		this._menuActions.forEach((a) => a.destroy());
		this._menuActions = this._config.actions
			.map((a) => {
				if (instanceofAction(a)) {
					return new ActionMenuItem(a);
				} else if (instanceofActionSubmenu(a)) {
					return new ActionSubmenuMenuItem(a);
				} else return null;
			})
			.filter((a) => a !== null);

		for (const action of this._menuActions) {
			this.addMenuItem(action);
			action.connect('run', async (_action, a: Action) => {
				if (this._entry) await this.run(this._entry, a);
			});
		}

		this.emit('actions-changed');
	}

	public activateDefaultAction(entry: ClipboardEntry): boolean {
		const defaultAction = findDefaultAction(this._config, entry);
		if (!defaultAction) return false;
		if (!testAction(entry, defaultAction)) return false;

		const logger = this.ext.logger;
		this.run(entry, defaultAction).catch(logger.error.bind(logger));
		return true;
	}

	public activateAction(entry: ClipboardEntry, id: string): boolean {
		const action = findActionById(this._config, id);
		if (!action) return false;
		if (!testAction(entry, action)) return false;

		const logger = this.ext.logger;
		this.run(entry, action).catch(logger.error.bind(logger));
		return true;
	}

	private async run(entry: ClipboardEntry, action: Action) {
		if (instanceofCommandAction(action)) await this.runCommandAction(entry, action);
		else if (instanceofColorAction(action)) this.runColorAction(entry, action);
		else if (instanceofQrCodeAction(action)) this.runQrCodeAction(entry, action);
	}

	private async runCommandAction(entry: ClipboardEntry, action: CommandAction) {
		const match = matchAction(entry, action)?.map((x) => x ?? '');
		if (!match) return;

		// Timeout after 30 seconds
		const token = new Gio.Cancellable();
		this._tokens.push(token);
		let timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_HIGH, 30, () => {
			timeoutId = -1;
			token.cancel();
			return GLib.SOURCE_REMOVE;
		});

		token.connect(() => {
			if (timeoutId >= 0) GLib.source_remove(timeoutId);
			const i = this._tokens.indexOf(token);
			if (i >= 0) this._tokens.splice(i, 1);
		});

		try {
			const flags =
				Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
			const process = Gio.Subprocess.new(['sh', '-c', action.command, '_', ...match.slice(1)], flags);

			// Wait for the command to complete and handle the output
			const [stdout, stderr] = await process.communicate_utf8_async(entry.content, token);

			if (process.get_successful()) {
				const output = trim(stdout);
				if (output.length === 0) return;

				switch (action.output) {
					case ActionOutput.Copy:
						this.emit('copy', output);
						break;
					case ActionOutput.Paste:
						this.emit('paste', output);
						break;
				}
			} else {
				this.ext.logger.error(stderr);
			}
		} catch (e) {
			this.ext.logger.error(e);
		} finally {
			token.cancel();
		}
	}

	private runColorAction(entry: ClipboardEntry, action: ColorAction) {
		if (!testAction(entry, action)) return;

		const color = Color.parse(entry.content.trim());
		if (!color) return;

		const converted = color.toColor(action.space);
		switch (action.output) {
			case ActionOutput.Copy:
				this.emit('copy', converted.toString());
				break;
			case ActionOutput.Paste:
				this.emit('paste', converted.toString());
				break;
		}
	}

	private runQrCodeAction(entry: ClipboardEntry, action: QrCodeAction) {
		if (!testAction(entry, action)) return;

		const dialog = new QrCodeDialog(this.ext, entry.content);
		dialog.open();
	}

	override destroy(): void {
		this._tokens.forEach((t) => t.cancel());
		this._monitor.cancel();
		super.destroy();
	}
}
