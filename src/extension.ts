import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { ConsoleLike, Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { HLJSApi } from 'highlight.js';
import type { LanguageFn } from 'highlight.js';

import { getDataPath, getHljsLanguages, getHljsPath } from './lib/common/constants.js';
import { DbusService } from './lib/common/dbus.js';
import { ClipboardHistory, CopyousSettings, migrateSettings } from './lib/common/settings.js';
import { SoundManager, tryCreateSoundManager } from './lib/common/sound.js';
import { ClipboardEntry } from './lib/database/database.js';
import { ClipboardEntryTracker } from './lib/database/entryTracker.js';
import { ClipboardManager } from './lib/misc/clipboard.js';
import { scheduleIdle } from './lib/misc/idle.js';
import { NotificationManager } from './lib/misc/notifications.js';
import { ShortcutManager } from './lib/misc/shortcuts.js';
import { ThemeManager } from './lib/misc/theme.js';
import { WorkQueue } from './lib/misc/workQueue.js';
import { ClipboardDialog } from './lib/ui/clipboardDialog.js';
import { ClipboardIndicator } from './lib/ui/indicator.js';

export default class CopyousExtension extends Extension {
	public settings!: CopyousSettings;
	public logger!: ConsoleLike;

	public hljs: HLJSApi | null | undefined;
	private hljsMonitor: Gio.FileMonitor | undefined;
	private hljsLanguages: Map<string, boolean> | undefined;
	private hljsCallbacks: Set<() => void> | undefined;

	public themeManager: ThemeManager | undefined;

	private clipboardDialog: ClipboardDialog | undefined;
	private indicator: ClipboardIndicator | undefined;

	private dbus: DbusService | undefined;

	public notificationManager: NotificationManager | undefined;
	private soundManager: SoundManager | undefined;

	public shortcutsManager: ShortcutManager | undefined;

	private entryTracker: ClipboardEntryTracker | undefined;
	private historyTimeoutId: number = -1;
	private historyTimeoutGeneration = 0;
	private updateHistory: boolean = false;

	public clipboardManager: ClipboardManager | undefined;
	public previewQueue!: WorkQueue;
	public networkQueue!: WorkQueue;
	private entryTrackerInit: Promise<void> | null = null;
	private entryTrackerInitQueued = false;

	override enable() {
		this.settings = this.getSettings();
		migrateSettings(this.settings);

		this.logger = this.getLogger();
		this.entryTrackerInit = null;
		this.entryTrackerInitQueued = false;
		// Keep a slot available for visible work; slow network requests cannot block local previews.
		this.previewQueue = new WorkQueue(scheduleIdle, 4, 1);
		this.networkQueue = new WorkQueue(scheduleIdle, 3, 1);
		const error = this.logger.error.bind(this.logger);

		// Highlight.js
		this.initHljs().catch(error);

		// Theme
		this.themeManager = new ThemeManager(this);

		// UI
		this.clipboardDialog = new ClipboardDialog(this);
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

		this.indicator = new ClipboardIndicator(this);
		this.indicator.connectObject(
			'open-dialog',
			() => this.clipboardDialog?.open(),
			'clear-history',
			(_: unknown, history: ClipboardHistory) => this.entryTracker?.clear(history),
			this,
		);

		// DBus
		this.dbus = new DbusService();
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
		this.notificationManager = new NotificationManager(this);
		tryCreateSoundManager(this)
			.then((soundManager) => {
				if (soundManager) this.soundManager = soundManager;
			})
			.catch(error);

		// Shortcuts
		this.shortcutsManager = new ShortcutManager(this, this.clipboardDialog);
		this.shortcutsManager.connectObject(
			'open-clipboard-dialog',
			() => this.clipboardDialog?.dialogShortcut(),
			'toggle-incognito-mode',
			() => this.indicator?.toggleIncognito(),
			this,
		);

		// Database
		this.entryTracker = new ClipboardEntryTracker(this);
		this.initEntryTracker().catch(error);
		this.initHistoryTimeout().catch(error);

		this.settings.connectObject(
			'changed::database-location',
			() => this.initEntryTracker().catch(error),
			'changed::database-backend',
			() => this.initEntryTracker().catch(error),
			'changed::history-time',
			() => this.initHistoryTimeout().catch(error),
			this,
		);

		// Clipboard Manager
		this.clipboardManager = new ClipboardManager(this, this.entryTracker);
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
		if (this.hljs) return;

		const hljsPath = getHljsPath(this);
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
				this.hljsMonitor = hljsPath.monitor(Gio.FileMonitorFlags.NONE, null);
				this.hljsMonitor.connectObject(
					'changed',
					async (_monitor: unknown, _file: unknown, _otherFile: unknown, eventType: Gio.FileMonitorEvent) => {
						if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
							await this.initHljs();
						}
					},
					this,
				);
			}
		}
	}

	private async loadHljsLanguages() {
		this.hljsLanguages ??= new Map<string, boolean>();

		if (!this.hljsMonitor) {
			const path = getDataPath(this).get_child('languages');
			this.hljsMonitor = path.monitor_directory(Gio.FileMonitorFlags.NONE, null);
			this.hljsMonitor.connectObject(
				'changed',
				async (_monitor: unknown, _file: unknown, _otherFile: unknown, eventType: Gio.FileMonitorEvent) => {
					if (
						eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
						eventType === Gio.FileMonitorEvent.DELETED
					) {
						await this.loadHljsLanguages();
					}
				},
				this,
			);
		}

		const languages = getHljsLanguages(this);
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

	public connectHljsInit(fn: () => void): () => void {
		if (this.hljs != null) return () => {};

		this.hljsCallbacks ??= new Set();
		this.hljsCallbacks.add(fn);
		return () => {
			this.hljsCallbacks?.delete(fn);
		};
	}

	private initEntryTracker(): Promise<void> {
		if (!this.entryTracker?.shouldInit) return Promise.resolve();
		this.entryTrackerInitQueued = true;
		return this.startHistoryReload();
	}

	private startHistoryReload(): Promise<void> {
		if (!this.entryTrackerInit) {
			const pending = this.reloadHistory().finally(() => {
				if (this.entryTrackerInit !== pending) return;
				this.entryTrackerInit = null;
				if (this.entryTrackerInitQueued && this.entryTracker) {
					this.startHistoryReload().catch(this.logger.error.bind(this.logger));
				}
			});
			this.entryTrackerInit = pending;
		}
		return this.entryTrackerInit;
	}

	private async reloadHistory() {
		while (this.entryTrackerInitQueued) {
			this.entryTrackerInitQueued = false;
			const tracker = this.entryTracker;
			const dialog = this.clipboardDialog;
			if (!tracker || !dialog) return;
			dialog.clearEntries();
			// eslint-disable-next-line no-await-in-loop -- database reloads must not overlap
			const entries = await tracker.init();
			if (tracker !== this.entryTracker || dialog !== this.clipboardDialog) return;
			if (!this.entryTrackerInitQueued) dialog.loadEntries(entries, (entry) => tracker.hasEntry(entry));
		}
	}

	private async initHistoryTimeout() {
		const generation = ++this.historyTimeoutGeneration;
		if (this.historyTimeoutId >= 0) GLib.source_remove(this.historyTimeoutId);
		this.historyTimeoutId = -1;
		const settings = this.settings;
		const tracker = this.entryTracker;
		const historyTime = settings?.get_int('history-time');
		if (historyTime === undefined || historyTime === 0) return;

		await tracker?.deleteOldest();
		if (generation !== this.historyTimeoutGeneration || settings !== this.settings || tracker !== this.entryTracker)
			return;
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
		this.historyTimeoutGeneration++;
		// UI
		this.entryTrackerInitQueued = false;
		this.clipboardDialog?.disconnectObject(this);
		this.clipboardDialog?.destroy();
		this.indicator?.disconnectObject(this);
		this.indicator?.destroy();
		this.clipboardDialog = undefined;
		this.previewQueue.destroy();
		this.networkQueue.destroy();
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
		const error = this.logger.error.bind(this.logger);
		this.entryTracker?.destroy().catch(error);
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
