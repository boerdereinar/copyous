import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { registerClass } from './gjs.js';
import { ClipboardHistory } from './settings.js';

const DBusInterfaceXml = `
<node>
	<interface name="org.gnome.Shell.Extensions.Copyous">
		<method name="Toggle"/>
		<method name="Show"/>
		<method name="Hide"/>
		<method name="ClearHistory">
			<arg type="b" direction="in" name="all"/>
		</method>
	</interface>
</node>
`.trim();

export interface DBusInterface {
	Toggle(): void;
	Show(): void;
	Hide(): void;
	ClearHistory(all: boolean): void;
}

@registerClass({
	Signals: {
		'toggle': {},
		'show': {},
		'hide': {},
		'clear-history': {
			param_types: [GObject.TYPE_INT],
		},
	},
})
export class DbusService extends GObject.Object implements DBusInterface {
	private dbus: Gio.DBusExportedObject | undefined;
	private ownerId: number;
	private confirmedLogoutId: number = -1;
	private confirmedRebootId: number = -1;
	private confirmedShutdownId: number = -1;
	private prepareForShutdownId: number = -1;

	constructor() {
		super();

		this.ownerId = Gio.DBus.own_name(
			Gio.BusType.SESSION,
			'org.gnome.Shell.Extensions.Copyous',
			Gio.BusNameOwnerFlags.NONE,
			this.busAcquired.bind(this),
			null,
			null,
		);

		this.registerSignals();
	}

	public Toggle() {
		this.emit('toggle');
	}

	public Show() {
		this.emit('show');
	}

	public Hide() {
		this.emit('hide');
	}

	public ClearHistory(all: boolean) {
		const history = all ? ClipboardHistory.Clear : ClipboardHistory.KeepPinnedAndTagged;
		this.emit('clear-history', history);
	}

	public destroy() {
		this.dbus?.unexport();
		this.dbus = undefined;

		this.unregisterSignals();
	}

	private busAcquired(connection: Gio.DBusConnection, _name: string) {
		this.dbus = Gio.DBusExportedObject.wrapJSObject(DBusInterfaceXml, this);
		this.dbus.export(connection, '/org/gnome/Shell/Extensions/Copyous');
	}

	private registerSignals() {
		this.confirmedLogoutId = Gio.DBus.session.signal_subscribe(
			null,
			'org.gnome.SessionManager.EndSessionDialog',
			'ConfirmedLogout',
			'/org/gnome/SessionManager/EndSessionDialog',
			null,
			Gio.DBusSignalFlags.NONE,
			() => this.emit('clear-history', -1),
		);

		this.confirmedRebootId = Gio.DBus.session.signal_subscribe(
			null,
			'org.gnome.SessionManager.EndSessionDialog',
			'ConfirmedReboot',
			'/org/gnome/SessionManager/EndSessionDialog',
			null,
			Gio.DBusSignalFlags.NONE,
			() => this.emit('clear-history', -1),
		);

		this.confirmedShutdownId = Gio.DBus.session.signal_subscribe(
			null,
			'org.gnome.SessionManager.EndSessionDialog',
			'ConfirmedShutdown',
			'/org/gnome/SessionManager/EndSessionDialog',
			null,
			Gio.DBusSignalFlags.NONE,
			() => this.emit('clear-history', -1),
		);

		this.prepareForShutdownId = Gio.DBus.system.signal_subscribe(
			null,
			'org.freedesktop.login1.Manager',
			'PrepareForShutdown',
			'/org/freedesktop/login1',
			null,
			Gio.DBusSignalFlags.NONE,
			() => this.emit('clear-history', -1),
		);
	}

	private unregisterSignals() {
		if (this.ownerId >= 0) Gio.DBus.unown_name(this.ownerId);
		if (this.confirmedLogoutId >= 0) Gio.DBus.session.signal_unsubscribe(this.confirmedLogoutId);
		if (this.confirmedRebootId >= 0) Gio.DBus.session.signal_unsubscribe(this.confirmedRebootId);
		if (this.confirmedShutdownId >= 0) Gio.DBus.session.signal_unsubscribe(this.confirmedShutdownId);
		if (this.prepareForShutdownId >= 0) Gio.DBus.system.signal_unsubscribe(this.prepareForShutdownId);

		this.ownerId = -1;
		this.confirmedLogoutId = -1;
		this.confirmedRebootId = -1;
		this.confirmedShutdownId = -1;
		this.prepareForShutdownId = -1;
	}
}
