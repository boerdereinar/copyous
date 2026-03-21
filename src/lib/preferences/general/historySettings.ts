import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { DatabaseBackend, getDataPath, getDefaultDatabaseFile } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { bind_enum } from '../../common/settings.js';
import { GdaDialog, checkGda } from '../dependencies/dependencies.js';
import { makeResettable } from '../utils.js';

Gio._promisify(Gtk.FileDialog.prototype, 'open', 'open_finish');

@registerClass({
	Properties: {
		primary: GObject.ParamSpec.string('primary', null, null, GObject.ParamFlags.READWRITE, ''),
		secondary: GObject.ParamSpec.string('secondary', null, null, GObject.ParamFlags.READWRITE, ''),
	},
})
class DatabaseBackendItem extends GObject.Object {
	declare primary: string;
	declare secondary: string;

	constructor(primary: string, secondary: string = '') {
		super();

		this.primary = primary;
		this.secondary = secondary;
	}
}

@registerClass({
	Properties: {
		'database-location': GObject.ParamSpec.string(
			'database-location',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			'',
		),
	},
})
export class HistorySettings extends Adw.PreferencesGroup {
	private readonly _settings: Gio.Settings;

	private _defaultDatabaseLocation: string;
	private readonly _databaseBackend: Adw.ComboRow;
	private readonly _databaseBackendButton: Gtk.Button;
	private readonly _databaseLocation: Adw.ActionRow;
	private readonly _clipboardHistory: Adw.ComboRow;

	private _libgda: boolean = false;

	constructor(
		private prefs: ExtensionPreferences,
		private window: Adw.PreferencesWindow,
	) {
		super({
			title: _('History'),
		});

		this._defaultDatabaseLocation = GLib.build_filenamev([getDataPath(prefs).get_path()!, 'clipboard.db']);

		const model = new Gio.ListStore({ item_type: DatabaseBackendItem.$gtype });
		model.append(new DatabaseBackendItem(_('Memory')));
		model.append(new DatabaseBackendItem(_('SQLite'), _('(recommended)')));
		model.append(new DatabaseBackendItem(_('JSON')));

		const factory = new Gtk.SignalListItemFactory();
		factory.connect('setup', (_factory, listItem: Gtk.ListItem) => (listItem.child = new Gtk.Label()));
		factory.connect(
			'bind',
			(_factory, listItem: Gtk.ListItem) =>
				((listItem.child as Gtk.Label).label = listItem.get_item<DatabaseBackendItem>().primary),
		);

		const listFactory = new Gtk.SignalListItemFactory();
		listFactory.connect('setup', (_factory, listItem: Gtk.ListItem) => {
			const box = new Gtk.Box({ spacing: 6 });
			box.append(new Gtk.Label());
			box.append(new Gtk.Label({ css_classes: ['dim-label'] }));
			listItem.child = box;
		});
		listFactory.connect('bind', (_factory, listItem: Gtk.ListItem) => {
			const item = listItem.get_item<DatabaseBackendItem>();
			const box = listItem.child as Gtk.Box;
			const primaryLabel = box.get_first_child()! as Gtk.Label;
			const secondaryLabel = primaryLabel.get_next_sibling()! as Gtk.Label;
			primaryLabel.label = item.primary;
			secondaryLabel.label = item.secondary;
		});

		this._databaseBackend = new Adw.ComboRow({
			title: _('Database'),
			subtitle: _('Select which database type to use for storing your clipboard'),
			factory,
			listFactory,
			model,
			sensitive: false,
		});
		this.add(this._databaseBackend);

		const separator = new Gtk.Separator({
			orientation: Gtk.Orientation.VERTICAL,
			margin_top: 9,
			margin_bottom: 9,
			margin_start: 6,
		});
		this._databaseBackend.add_suffix(separator);

		this._databaseBackendButton = new Gtk.Button({
			icon_name: Icon.Undo,
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
		});
		this._databaseBackend.add_suffix(this._databaseBackendButton);
		this._databaseBackendButton.connect('clicked', this.databaseBackendButtonClicked.bind(this));

		this._databaseLocation = new Adw.ActionRow({
			title: _('Database Location'),
			activatable: true,
			sensitive: false,
		});
		this._databaseLocation.connect('activated', () => this.openDatabaseLocation(window));
		this.add(this._databaseLocation);

		this._clipboardHistory = new Adw.ComboRow({
			title: _('Clipboard History'),
			subtitle: _(
				'Choose what to do with your clipboard history when you restart, log out, or shut down your system',
			),
			model: Gtk.StringList.new([_('Clear'), _('Keep Pinned/Tagged'), _('Keep All')]),
			sensitive: false,
		});
		this.add(this._clipboardHistory);

		const historyLength = new Adw.SpinRow({
			title: _('History Length'),
			subtitle: _('Select how many items to keep in the clipboard history'),
			adjustment: new Gtk.Adjustment({ lower: 10, upper: 500, step_increment: 1, page_increment: 5, value: 50 }),
		});
		this.add(historyLength);

		const timeLimit = new Adw.SpinRow({
			title: _('History Time Limit'),
			subtitle: _(
				'Select how many minutes to keep items in the clipboard history. Set to 0 to disable the time limit',
			),
			adjustment: new Gtk.Adjustment({ lower: 0, upper: 1440, step_increment: 5, page_increment: 15, value: 0 }),
		});
		this.add(timeLimit);

		// Bind properties
		this._settings = prefs.getSettings();
		this._settings.bind('database-location', this, 'database-location', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(this._settings, 'clipboard-history', this._clipboardHistory, 'selected');
		this._settings.bind('history-length', historyLength, 'value', Gio.SettingsBindFlags.DEFAULT);
		this._settings.bind('history-time', timeLimit, 'value', Gio.SettingsBindFlags.DEFAULT);

		makeResettable(this._databaseLocation, this._settings, 'database-location');
		makeResettable(this._clipboardHistory, this._settings, 'clipboard-history');
		makeResettable(historyLength, this._settings, 'history-length');
		makeResettable(timeLimit, this._settings, 'history-time');

		// Check gda
		checkGda(this.prefs)
			.then(this.initializeDatabaseBackend.bind(this))
			.catch(() => {});
	}

	get databaseLocation(): string {
		if (this._databaseLocation.subtitle === this._defaultDatabaseLocation) {
			return '';
		} else {
			return this._databaseLocation.subtitle;
		}
	}

	set databaseLocation(value: string) {
		if (value === '') {
			this._databaseLocation.subtitle = this._defaultDatabaseLocation;
		} else {
			this._databaseLocation.subtitle = value;
		}

		this.notify('database-location');
	}

	private initializeDatabaseBackend(gda: boolean): void {
		this._libgda = gda;
		this._databaseBackend.sensitive = true;

		let backend = this._settings.get_enum('database-backend');
		if (backend === DatabaseBackend.Default) {
			let location = this._settings.get_string('database-location');
			location ||= getDataPath(this.prefs).get_child('clipboard.db').get_path()!;
			const file = Gio.File.new_for_path(location);

			const dir = file.get_parent()!;
			const fileName = file.get_basename()!.replace(/(.db|.json)$/, '');
			const dbFile = dir.get_child(`${fileName}.db`);
			const jsonFile = dir.get_child(`${fileName}.json`);

			if (this._settings.get_boolean('in-memory-database')) {
				backend = DatabaseBackend.Memory;
			} else if (dbFile.query_exists(null)) {
				backend = DatabaseBackend.Sqlite;
			} else if (jsonFile.query_exists(null)) {
				backend = DatabaseBackend.Json;
			} else if (this._libgda) {
				backend = DatabaseBackend.Sqlite;
			} else {
				backend = DatabaseBackend.Json;
			}
		}

		this._databaseBackend.selected = backend - 1;
		this._databaseBackend.connect('notify::selected', () => {
			this._settings.set_enum('database-backend', this._databaseBackend.selected + 1);
			this.updateDatabaseBackend(true);
		});
		this.updateDatabaseBackend(false);
	}

	private updateDatabaseBackend(update: boolean): void {
		const backend: DatabaseBackend = this._databaseBackend.selected + 1;
		if (update) this._settings.set_enum('database-backend', backend);

		const isDefaultLocation = this.databaseLocation === '';
		this._defaultDatabaseLocation = getDefaultDatabaseFile(this.prefs, backend).get_path()!;
		if (isDefaultLocation) this._databaseLocation.subtitle = this._defaultDatabaseLocation;
		this._databaseLocation.sensitive = backend !== DatabaseBackend.Memory;
		this._clipboardHistory.sensitive = backend !== DatabaseBackend.Memory;

		if (backend === DatabaseBackend.Sqlite) {
			if (this._libgda) {
				this._databaseBackendButton.sensitive = false;
				this._databaseBackendButton.icon_name = Icon.Undo;
			} else {
				this._databaseBackendButton.sensitive = true;
				this._databaseBackendButton.icon_name = Icon.Warning;
			}
		} else {
			this._databaseBackendButton.sensitive = true;
			this._databaseBackendButton.icon_name = Icon.Undo;
		}
	}

	private databaseBackendButtonClicked() {
		const backend: DatabaseBackend = this._databaseBackend.selected + 1;

		if (backend === DatabaseBackend.Sqlite) {
			if (!this._libgda) {
				const gdaDialog = new GdaDialog();
				gdaDialog.present(this.window);
			}
		} else {
			this._databaseBackend.selected = DatabaseBackend.Sqlite - 1;
		}
	}

	private async openDatabaseLocation(window: Adw.PreferencesWindow): Promise<void> {
		const selected = this._databaseBackend.selected;
		const patterns = selected === 0 ? [] : selected === 1 ? ['*.db'] : ['*.json'];

		const dialog = new Gtk.FileDialog({
			initial_file: Gio.File.new_for_path(this.databaseLocation),
			default_filter: new Gtk.FileFilter({ patterns }),
		});

		try {
			const result = await dialog.open(window, null);
			const path = result?.get_path();
			if (path != null) {
				this.databaseLocation = path;
			}
		} catch {
			console.error('Failed to open database location');
		}
	}
}
