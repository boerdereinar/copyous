import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as animationUtils from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as CheckBox from 'resource:///org/gnome/shell/ui/checkBox.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type CopyousExtension from '../../extension.js';
import { Color } from '../common/color.js';
import { ClipboardHistory, ItemType } from '../common/constants.js';
import { registerClass } from '../common/gjs.js';
import { Icon, loadIcon } from '../common/icons.js';
import { ClipboardEntry } from '../misc/db.js';

@registerClass({
	Signals: {
		'clear-history': {
			param_types: [GObject.TYPE_INT],
		},
	},
})
export class ConfirmClearHistoryDialog extends ModalDialog.ModalDialog {
	constructor() {
		super();

		const content = new Dialog.MessageDialogContent({
			title: _('Clear Clipboard History?'),
			description: _('Are you sure you want to clear your clipboard history?'),
		});
		this.contentLayout.add_child(content);

		const checkbox = new CheckBox.CheckBox(_('Clear Pinned/Tagged Items'));
		content.add_child(checkbox);

		this.addButton({
			label: _('Cancel'),
			action: this.close.bind(this),
			default: true,
			key: Clutter.KEY_Escape,
		});

		this.addButton({
			label: _('Clear'),
			action: () => {
				this.emit(
					'clear-history',
					checkbox.checked ? ClipboardHistory.Clear : ClipboardHistory.KeepPinnedAndTagged,
				);
				this.close();
			},
		});
	}
}

@registerClass({
	Properties: {
		incognito: GObject.ParamSpec.boolean('incognito', null, null, GObject.ParamFlags.READWRITE, false),
	},
	Signals: {
		'open-dialog': {},
		'clear-history': {
			param_types: [GObject.TYPE_INT],
		},
	},
})
export class ClipboardIndicator extends PanelMenu.Button {
	private _incognito: boolean = false;

	declare menu: PopupMenu.PopupMenu;
	private readonly _box: St.BoxLayout;
	private readonly _icon: St.Icon;
	private readonly _incognitoSwitch: PopupMenu.PopupSwitchMenuItem;
	private _previewWidget?: St.Widget;

	constructor(private ext: CopyousExtension) {
		super(0.5, ext.metadata.name, false);

		this._box = new St.BoxLayout({
			style_class: 'copyous-indicator-box',
			orientation: Clutter.Orientation.HORIZONTAL,
		});
		this.add_child(this._box);

		this._icon = new St.Icon({
			gicon: loadIcon(ext, Icon.Clipboard),
			style_class: 'system-status-icon',
		});
		this._box.add_child(this._icon);

		this._incognitoSwitch = new PopupMenu.PopupSwitchMenuItem(_('Incognito Mode'), false);
		this.menu.addMenuItem(this._incognitoSwitch);
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		this.menu.addAction(_('Clear History'), () => this.confirmClearHistory());
		this.menu.addAction(_('Settings'), () => ext.openPreferences());

		// Add to panel
		Main.panel.addToStatusArea(ext.uuid, this, 1, 'right');

		// Bind properties
		this.ext.settings.connectObject(
			'changed::show-indicator',
			this.updateSettings.bind(this),
			'changed::show-content-indicator',
			this.updateSettings.bind(this),
			'changed::incognito',
			this.updateSettings.bind(this),
			this,
		);

		this.bind_property('incognito', this._incognitoSwitch, 'state', GObject.BindingFlags.BIDIRECTIONAL);

		this.updateSettings();
	}

	get incognito() {
		return this._incognito;
	}

	set incognito(value: boolean) {
		if (this._incognito === value) return;
		this._incognitoSwitch.state = value;
		this._incognito = value;
		this._icon.gicon = loadIcon(this.ext, value ? Icon.ClipboardDisabled : Icon.Clipboard);
		this.ext.settings.set_boolean('incognito', value);
		this.notify('incognito');
	}

	private set previewWidget(widget: St.Widget) {
		this._previewWidget?.destroy();
		widget.visible = this.ext.settings.get_boolean('show-content-indicator');
		this._previewWidget = widget;
		this._box.add_child(widget);
	}

	private updateSettings() {
		this.visible = this.ext.settings.get_boolean('show-indicator');
		if (this._previewWidget) this._previewWidget.visible = this.ext.settings.get_boolean('show-content-indicator');
		this.incognito = this.ext.settings.get_boolean('incognito');
	}

	toggleIncognito() {
		this.incognito = !this.incognito;
	}

	animate() {
		if (this.ext.settings.get_boolean('wiggle-indicator')) {
			animationUtils.wiggle(this._icon, { offset: 2, duration: 65, wiggleCount: 3 });
		}
	}

	showEntry(entry: ClipboardEntry) {
		switch (entry.type) {
			case ItemType.Text:
			case ItemType.Code:
			case ItemType.Link:
			case ItemType.Character:
				this.showText(entry.content.split('\n')[0] ?? '');
				break;
			case ItemType.Image:
				this.showImageFile(Gio.File.new_for_uri(entry.content));
				break;
			case ItemType.File: {
				const file = Gio.File.new_for_uri(entry.content).get_basename();
				this.showText(file ?? '', true);
				break;
			}
			case ItemType.Files: {
				const n = entry.content.split('\n').length;
				this.showText(ngettext('%d File', '%d Files', n).format(n));
				break;
			}
			case ItemType.Color: {
				const color = Color.parse(entry.content)?.hex();
				if (!color) return;

				const pixbuf = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 32, 32);
				pixbuf.fill(parseInt(color.toString().padEnd(9, 'f').replace('#', '0x')));
				const [, buffer] = pixbuf.save_to_bufferv('png', null, null);
				this.showImageBytes(buffer);
				break;
			}
		}
	}

	showText(text: string, start: boolean = false) {
		const label = new St.Label({
			style_class: 'indicator-label',
			y_align: Clutter.ActorAlign.CENTER,
			text,
		});
		label.clutter_text.ellipsize = start ? Pango.EllipsizeMode.START : Pango.EllipsizeMode.END;
		this.previewWidget = label;
	}

	showImageFile(file: Gio.File) {
		if (!file.query_exists(null)) return;
		this.previewWidget = new St.Icon({
			style_class: 'system-status-icon',
			gicon: Gio.FileIcon.new(file),
			y_align: Clutter.ActorAlign.CENTER,
		});
	}

	showImageBytes(bytes: Uint8Array) {
		this.previewWidget = new St.Icon({
			style_class: 'system-status-icon',
			gicon: Gio.BytesIcon.new(bytes),
			y_align: Clutter.ActorAlign.CENTER,
		});
	}

	private confirmClearHistory() {
		const dialog = new ConfirmClearHistoryDialog();
		dialog.connect('clear-history', (_dialog, history) => this.emit('clear-history', history));
		dialog.open();
	}

	override vfunc_event(event: Clutter.Event): boolean {
		if (
			event.type() === Clutter.EventType.TOUCH_BEGIN ||
			(event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY)
		) {
			this.emit('open-dialog');
			return Clutter.EVENT_STOP;
		}
		if (event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_MIDDLE) {
			this.ext.openPreferences();
			return Clutter.EVENT_STOP;
		}
		return super.vfunc_event(event);
	}

	override destroy() {
		this.ext.settings.disconnectObject(this);

		super.destroy();
	}
}
