import GLib from 'gi://GLib';
import type Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ConsoleLike, Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { HLJSApi, LanguageFn } from 'highlight.js';

import type { DbusService } from './lib/common/dbus.js';
import type { ClipboardHistory, CopyousSettings } from './lib/common/settings.js';
import type { SoundManager } from './lib/common/sound.js';
import type { ClipboardEntry } from './lib/database/database.js';
import type { ClipboardEntryTracker } from './lib/database/entryTracker.js';
import type { ClipboardManager } from './lib/misc/clipboard.js';
import type { NotificationManager } from './lib/misc/notifications.js';
import type { ShortcutManager } from './lib/misc/shortcuts.js';
import type { ThemeManager } from './lib/misc/theme.js';
import type { ClipboardDialog } from './lib/ui/clipboardDialog.js';
import type { ClipboardIndicator } from './lib/ui/indicator.js';

// Top-level imports are intentionally minimal: only what is needed to schedule
// the deferred enable.  All UI / DBus / database / theme code is dynamically
// imported below, after `startup-complete`, so the extension does not block the
// shell main loop on cold boot (which previously caused a brief vanilla-dock
// flash and slowed the initial paint).

type Mods = {
	Gio: typeof import('gi://Gio').default;
	getDataPath: typeof import('./lib/common/constants.js').getDataPath;
	getHljsLanguages: typeof import('./lib/common/constants.js').getHljsLanguages;
	getHljsPath: typeof import('./lib/common/constants.js').getHljsPath;
	DbusService: typeof import('./lib/common/dbus.js').DbusService;
	migrateSettings: typeof import('./lib/common/settings.js').migrateSettings;
	tryCreateSoundManager: typeof import('./lib/common/sound.js').tryCreateSoundManager;
	ClipboardEntryTracker: typeof import('./lib/database/entryTracker.js').ClipboardEntryTracker;
	ClipboardManager: typeof import('./lib/misc/clipboard.js').ClipboardManager;
	NotificationManager: typeof import('./lib/misc/notifications.js').NotificationManager;
	ShortcutManager: typeof import('./lib/misc/shortcuts.js').ShortcutManager;
	ThemeManager: typeof import('./lib/misc/theme.js').ThemeManager;
	ClipboardDialog: typeof import('./lib/ui/clipboardDialog.js').ClipboardDialog;
	ClipboardIndicator: typeof import('./lib/ui/indicator.js').ClipboardIndicator;
};

let M: Mods | null = null;

const heavyDepsReady: Promise<void> = (async () => {
	// Wait for the shell to finish its own startup before pulling in heavy
	// dependencies. Importing big modules and constructing the dialog/indicator
	// during shell startup competes with mutter for the main loop, which is
	// what produced the dock flash on cold boot.
	const lm = Main.layoutManager as { _startingUp?: boolean } & typeof Main.layoutManager;
	if (lm._startingUp) {
		await new Promise<void>((resolve) => {
			const id = lm.connect('startup-complete', () => {
				lm.disconnect(id);
				resolve();
			});
		});
	}

	const [
		gioMod,
		constantsMod,
		dbusMod,
		settingsMod,
		soundMod,
		entryTrackerMod,
		clipboardMod,
		notificationsMod,
		shortcutsMod,
		themeMod,
		clipboardDialogMod,
		indicatorMod,
	] = await Promise.all([
		import('gi://Gio'),
		import('./lib/common/constants.js'),
		import('./lib/common/dbus.js'),
		import('./lib/common/settings.js'),
		import('./lib/common/sound.js'),
		import('./lib/database/entryTracker.js'),
		import('./lib/misc/clipboard.js'),
		import('./lib/misc/notifications.js'),
		import('./lib/misc/shortcuts.js'),
		import('./lib/misc/theme.js'),
		import('./lib/ui/clipboardDialog.js'),
		import('./lib/ui/indicator.js'),
	]);

	M = {
		Gio: gioMod.default,
		getDataPath: constantsMod.getDataPath,
		getHljsLanguages: constantsMod.getHljsLanguages,
		getHljsPath: constantsMod.getHljsPath,
		DbusService: dbusMod.DbusService,
		migrateSettings: settingsMod.migrateSettings,
		tryCreateSoundManager: soundMod.tryCreateSoundManager,
		ClipboardEntryTracker: entryTrackerMod.ClipboardEntryTracker,
		ClipboardManager: clipboardMod.ClipboardManager,
		NotificationManager: notificationsMod.NotificationManager,
		ShortcutManager: shortcutsMod.ShortcutManager,
		ThemeManager: themeMod.ThemeManager,
		ClipboardDialog: clipboardDialogMod.ClipboardDialog,
		ClipboardIndicator: indicatorMod.ClipboardIndicator,
	};
})();

export default class CopyousExtension extends Extension {
	public settings!: CopyousSettings;
	public logger!: ConsoleLike;

	public hljs: HLJSApi | null | undefined;
	private hljsMonitor: Gio.FileMonitor | undefined;
	private hljsLanguages: Map<string, boolean> | undefined;
	private hljsCallbacks: (() => void)[] | undefined;

	public themeManager: ThemeManager | undefined;

	private clipboardDialog: ClipboardDialog | undefined;
	private indicator: ClipboardIndicator | undefined;

	private dbus: DbusService | undefined;

	public notificationManager: NotificationManager | undefined;
	private soundManager: SoundManager | undefined;

	public shortcutsManager: ShortcutManager | undefined;

	private entryTracker: ClipboardEntryTracker | undefined;
	private historyTimeoutId: number = -1;
	private updateHistory: boolean = false;

	public clipboardManager: ClipboardManager | undefined;

	private _enableDeferredId: number = 0;
	private _enabled: boolean = false;

	override enable() {
		this._enabled = true;

		// Defer the actual work to an idle callback that resolves once the
		// shell has finished startup and the heavy modules have loaded.
		this._enableDeferredId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
			this._enableDeferredId = 0;
			this._runDeferredEnable().catch((e: unknown) => {
				console.error(`[Copyous] Failed to enable: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
			});
			return GLib.SOURCE_REMOVE;
		});
	}

	private async _runDeferredEnable() {
		await heavyDepsReady;
		if (!this._enabled || !M) return;

		this.settings = this.getSettings();
		M.migrateSettings(this.settings);

		this.logger = this.getLogger();
		const error = this.logger.error.bind(this.logger);

		// Highlight.js
		this.initHljs().catch(error);

		// Theme
		this.themeManager = new M.ThemeManager(this);

		// UI
		this.clipboardDialog = new M.ClipboardDialog(this);
		this.clipboardDialog.connectObject(
			'notify::opened',
			async () => {
				// Update the history when the dialog is closed and an update was scheduled while the dialog was open
				if (!this.clipboardDialog?.opened && this.updateHistory) {
					await this.entryTracker?.deleteOldest();
				}
			},
			'copy',
			async (_: unknown, entry: ClipboardEntry) => {
				await this.clipboardManager?.copyEntry(entry);
				this.indicator?.showEntry(entry);
			},
			'paste',
			async (_: unknown, entry: ClipboardEntry) => {
				await this.clipboardManager?.pasteEntry(entry);
				this.indicator?.showEntry(entry);
			},
			'clear-history',
			(_: unknown, history: ClipboardHistory) => this.entryTracker?.clear(history),
			this,
		);

		this.indicator = new M.ClipboardIndicator(this);
		this.indicator.connectObject(
			'open-dialog',
			() => this.clipboardDialog?.open(),
			'clear-history',
			(_: unknown, history: ClipboardHistory) => this.entryTracker?.clear(history),
			this,
		);

		// DBus
		this.dbus = new M.DbusService();
		this.dbus.connectObject(
			'toggle',
			() => this.clipboardDialog?.toggle(),
			'show',
			() => this.clipboardDialog?.open(),
			'hide',
			() => this.clipboardDialog?.close(),
			'clear-history',
			(_: unknown, history: ClipboardHistory | -1) => this.entryTracker?.clear(history === -1 ? null : history),
			this,
		);

		// Feedback
		this.notificationManager = new M.NotificationManager(this);
		M.tryCreateSoundManager(this)
			.then((soundManager) => {
				if (soundManager) this.soundManager = soundManager;
			})
			.catch(error);

		// Shortcuts
		this.shortcutsManager = new M.ShortcutManager(this, this.clipboardDialog);
		this.shortcutsManager.connectObject(
			'open-clipboard-dialog',
			() => this.clipboardDialog?.dialogShortcut(),
			'toggle-incognito-mode',
			() => this.indicator?.toggleIncognito(),
			this,
		);

		// Database
		this.entryTracker = new M.ClipboardEntryTracker(this);
		this.initEntryTracker().catch(error);
		this.initHistoryTimeout().catch(error);

		this.settings.connectObject(
			'changed::database-location',
			this.initEntryTracker.bind(this),
			'changed::database-backend',
			this.initEntryTracker.bind(this),
			'changed::history-time',
			this.initHistoryTimeout.bind(this),
			this,
		);

		// Clipboard Manager
		this.clipboardManager = new M.ClipboardManager(this, this.entryTracker);
		this.clipboardManager.connectObject(
			'clipboard',
			(_: unknown, entry: ClipboardEntry) => {
				this.clipboardDialog?.addEntry(entry);
				this.indicator?.showEntry(entry);
				this.indicator?.animate();
				this.notificationManager?.notification(entry);
				this.soundManager?.playSound();
			},
			'text',
			(_: unknown, text: string) => {
				this.indicator?.showText(text);
				this.indicator?.animate();
				this.notificationManager?.textNotification(text);
				this.soundManager?.playSound();
			},
			'image',
			(_: unknown, image: Uint8Array, width: number, height: number) => {
				this.indicator?.showImageBytes(image);
				this.indicator?.animate();
				this.notificationManager?.imageNotification(image, width, height);
				this.soundManager?.playSound();
			},
			this,
		);
	}

	private async initHljs() {
		if (this.hljs || !M) return;

		const hljsPath = M.getHljsPath(this);
		try {
			const hljs = (await import(hljsPath.get_uri())) as { default: HLJSApi };
			this.hljs = hljs.default;

			// Disable file monitor
			this.hljsMonitor?.cancel();
			this.hljsMonitor = undefined;

			// Initialize extra languages
			await this.loadHljsLanguages();

			// Notify dependents
			this.hljsCallbacks?.forEach((fn) => fn());
			this.hljsCallbacks = undefined;
		} catch {
			this.hljs = null;

			// Automatically load highlight.js
			if (!this.hljsMonitor) {
				this.hljsMonitor = hljsPath.monitor(M.Gio.FileMonitorFlags.NONE, null);
				this.hljsMonitor.connectObject(
					'changed',
					async (_monitor: unknown, _file: unknown, _otherFile: unknown, eventType: Gio.FileMonitorEvent) => {
						if (eventType === M!.Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
							await this.initHljs();
						}
					},
					this,
				);
			}
		}
	}

	private async loadHljsLanguages() {
		if (!M) return;
		this.hljsLanguages ??= new Map<string, boolean>();

		if (!this.hljsMonitor) {
			const path = M.getDataPath(this).get_child('languages');
			this.hljsMonitor = path.monitor_directory(M.Gio.FileMonitorFlags.NONE, null);
			this.hljsMonitor.connectObject(
				'changed',
				async (_monitor: unknown, _file: unknown, _otherFile: unknown, eventType: Gio.FileMonitorEvent) => {
					if (
						eventType === M!.Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
						eventType === M!.Gio.FileMonitorEvent.DELETED
					) {
						await this.loadHljsLanguages();
					}
				},
				this,
			);
		}

		const languages = M.getHljsLanguages(this);
		await Promise.all(
			languages.map(async ([name, _language, _hash, path]) => {
				const enabled = this.hljsLanguages?.get(name) ?? false;

				if (!path.query_exists(null)) {
					if (enabled) {
						this.hljs?.unregisterLanguage(name);
						this.hljsLanguages?.set(name, false);
					}
					return;
				}

				if (enabled) return;

				try {
					const language = (await import(path.get_uri())) as { default: LanguageFn };
					this.hljs?.registerLanguage(name, language.default);
					this.hljsLanguages?.set(name, true);
				} catch {
					this.logger.error(`Failed to register language "${name}"`);
				}
			}),
		);
	}

	public connectHljsInit(fn: () => void) {
		if (this.hljs != null) return;

		this.hljsCallbacks ??= [];
		this.hljsCallbacks.push(fn);
	}

	private async initEntryTracker() {
		if (!this.entryTracker || !this.entryTracker.shouldInit) return;

		this.clipboardDialog?.clearEntries();
		const entries = await this.entryTracker.init();
		this.clipboardDialog?.loadEntries(entries);

		// Pre-warm allocation: ask for the preferred size at low priority so the
		// first user-triggered open() does not pay the cost of laying out the
		// scroll container from scratch.
		GLib.idle_add(GLib.PRIORITY_LOW, () => {
			this.clipboardDialog?.preWarm();
			return GLib.SOURCE_REMOVE;
		});
	}

	private async initHistoryTimeout() {
		if (this.historyTimeoutId >= 0) GLib.source_remove(this.historyTimeoutId);

		const historyTime = this.settings?.get_int('history-time');
		if (historyTime === undefined || historyTime === 0) return;

		await this.entryTracker?.deleteOldest();
		this.historyTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
			// Do not update the history if the dialog is open
			this.updateHistory = this.clipboardDialog?.opened ?? false;
			if (this.updateHistory) return GLib.SOURCE_CONTINUE;

			if (this.entryTracker?.checkOldest()) {
				this.entryTracker?.deleteOldest().catch(this.logger.error.bind(this.logger));
			}

			return GLib.SOURCE_CONTINUE;
		});
	}

	override disable() {
		this._enabled = false;

		// Cancel deferred enable if it has not run yet
		if (this._enableDeferredId) {
			GLib.source_remove(this._enableDeferredId);
			this._enableDeferredId = 0;
		}

		// UI
		this.clipboardDialog?.disconnectObject(this);
		this.clipboardDialog?.destroy();
		this.indicator?.disconnectObject(this);
		this.indicator?.destroy();
		this.clipboardDialog = undefined;
		this.indicator = undefined;

		// Highlight.js
		this.hljs = undefined;
		this.hljsMonitor?.disconnectObject(this);
		this.hljsMonitor?.cancel();
		this.hljsMonitor = undefined;
		this.hljsLanguages = undefined;
		this.hljsCallbacks = undefined;

		// Theme
		this.themeManager?.destroy();
		this.themeManager = undefined;

		// DBus
		this.dbus?.disconnectObject(this);
		this.dbus?.destroy();
		this.dbus = undefined;

		// Feedback
		this.notificationManager = undefined;
		this.soundManager?.destroy();
		this.soundManager = undefined;

		// Shortcuts
		this.shortcutsManager?.disconnectObject(this);
		this.shortcutsManager?.destroy();
		this.shortcutsManager = undefined;

		// Database
		const error = this.logger?.error.bind(this.logger);
		this.entryTracker?.destroy().catch(error ?? (() => {}));
		this.entryTracker = undefined;

		if (this.historyTimeoutId >= 0) GLib.source_remove(this.historyTimeoutId);
		this.historyTimeoutId = -1;

		// Clipboard Manager
		this.clipboardManager?.disconnectObject(this);
		this.clipboardManager?.destroy();
		this.clipboardManager = undefined;

		// Globals
		this.settings?.disconnectObject(this);
		this.settings = undefined!;
		this.logger = undefined!;
	}

	/* DEBUG-ONLY */
	override getSettings(schema?: string): Gio.Settings & CopyousSettings {
		try {
			const environment = GLib.get_environ();
			const settings = GLib.environ_getenv(environment, 'DEBUG_COPYOUS_SCHEMA');
			if (settings) {
				this.getLogger().log('Using debug schema');
				schema ??= this.metadata['settings-schema'] + '.debug';
			}

			return super.getSettings(schema) as Gio.Settings & CopyousSettings;
		} catch {
			// Fallback for when debug schema does not exist
			return super.getSettings() as Gio.Settings & CopyousSettings;
		}
	}
}
