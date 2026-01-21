import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { formatTimeSpan } from 'resource:///org/gnome/shell/misc/dateUtils.js';

import { ActiveState, Tag } from '../../common/constants.js';
import { enumParamSpec, flagsParamSpec, registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';

// https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/messageList.js#L277
@registerClass()
class TimeLabel extends St.Label {
	private _datetime: GLib.DateTime;

	constructor() {
		super({
			style_class: 'event-time',
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.START,
			y_align: Clutter.ActorAlign.END,
			min_width: 0,
		});

		this.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

		this._datetime = GLib.DateTime.new_now_utc();
	}

	get datetime() {
		return this._datetime;
	}

	set datetime(datetime) {
		if (this._datetime.equal(datetime)) return;

		this._datetime = datetime;

		if (this.mapped) this._updateText();
	}

	private _updateText() {
		this.text = formatTimeSpan(this._datetime);
	}

	override vfunc_map() {
		this._updateText();

		super.vfunc_map();
	}
}

export const HeaderControlsVisibility = {
	Visible: 0,
	VisibleOnHover: 1,
	Hidden: 2,
} as const;

export type HeaderControlsVisibility = (typeof HeaderControlsVisibility)[keyof typeof HeaderControlsVisibility];

@registerClass({
	Properties: {
		'pinned': GObject.ParamSpec.boolean('pinned', null, null, GObject.ParamFlags.READWRITE, false),
		'datetime': GObject.ParamSpec.boxed('datetime', null, null, GObject.ParamFlags.READWRITE, GLib.DateTime),
		'force-delete': GObject.ParamSpec.boolean('force-delete', null, null, GObject.ParamFlags.READWRITE, true),
		'protect-pinned': GObject.ParamSpec.boolean('protect-pinned', null, null, GObject.ParamFlags.READWRITE, true),
		'protect-tagged': GObject.ParamSpec.boolean('protect-tagged', null, null, GObject.ParamFlags.READWRITE, true),
		'header-visible': GObject.ParamSpec.boolean('header-visible', null, null, GObject.ParamFlags.READWRITE, true),
		'show-title': GObject.ParamSpec.boolean('show-title', null, null, GObject.ParamFlags.READWRITE, true),
		'controls-visibility': enumParamSpec(
			'controls-visibility',
			GObject.ParamFlags.READWRITE,
			HeaderControlsVisibility,
			HeaderControlsVisibility.Visible,
		),
		'tag': GObject.ParamSpec.string('tag', null, null, GObject.ParamFlags.READWRITE, ''),
		'active': flagsParamSpec('active', GObject.ParamFlags.READWRITE, ActiveState, ActiveState.None),
		'custom-title': GObject.ParamSpec.string('custom-title', null, null, GObject.ParamFlags.READWRITE, ''),
		'default-title': GObject.ParamSpec.string('default-title', null, null, GObject.ParamFlags.READWRITE, ''),
	},
	Signals: {
		'delete': {},
		'open-menu': {
			param_types: [GObject.TYPE_INT, GObject.TYPE_INT, GObject.TYPE_INT, GObject.TYPE_INT],
		},
	},
})
export class ClipboardItemHeader extends St.BoxLayout {
	private _forceDelete: boolean = false;
	private _protectPinned: boolean = true;
	private _protectTagged: boolean = true;
	private _headerVisible: boolean = true;
	private _controlsVisibility: HeaderControlsVisibility = HeaderControlsVisibility.Visible;
	private _tag: Tag | null = null;
	private _active: ActiveState = ActiveState.None;
	private _customTitle: string = '';
	private _defaultTitle: string = '';
	private _isEditing: boolean = false;

	private readonly _headerIcon: St.Icon;
	private readonly _headerContent: St.BoxLayout;
	private readonly _headerTitle: St.Label;
	private _titleEntry: St.Entry | null = null;
	private readonly _timeLabel: TimeLabel;
	public buttons: St.BoxLayout;
	private readonly _deleteButton: St.Button;
	private readonly _menuButton: St.Button;
	private readonly _pinButton: St.Button;
	private readonly _tagIcon: St.Bin;
	private _clickCount: number = 0;
	private _lastClickTime: number = 0;

	constructor(ext: Extension, icon: Icon, title: string) {
		super({
			style_class: 'clipboard-item-header',
			y_align: Clutter.ActorAlign.START,
			x_expand: true,
			y_expand: false,
		});

		this._defaultTitle = title;

		this._headerIcon = new St.Icon({
			style_class: 'clipboard-item-header-icon',
			gicon: loadIcon(ext, icon),
			y_align: Clutter.ActorAlign.CENTER,
		});
		this.add_child(this._headerIcon);

		this._headerContent = new St.BoxLayout({
			style_class: 'clipboard-item-header-content',
			y_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
		});
		this.add_child(this._headerContent);

		this._headerTitle = new St.Label({
			style_class: 'clipboard-item-title',
			text: title,
			y_align: Clutter.ActorAlign.END,
			x_expand: true,
			reactive: true,
		});
		this._headerTitle.clutter_text.ellipsize = Pango.EllipsizeMode.END;
		this._headerContent.add_child(this._headerTitle);

		// Handle double-click on title for inline editing
		// We must stop all button events on the title to prevent them from
		// propagating to the parent ClipboardItem button which would trigger paste
		this._headerTitle.connect('button-press-event', (_actor, event: Clutter.Event) => {
			if (event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;

			const currentTime = event.get_time();
			const doubleClickTime = Clutter.Settings.get_default()?.double_click_time ?? 400;

			if (currentTime - this._lastClickTime < doubleClickTime) {
				this._clickCount++;
				if (this._clickCount >= 2) {
					this._clickCount = 0;
					this._startEditing();
				}
			} else {
				this._clickCount = 1;
			}
			this._lastClickTime = currentTime;

			// Always stop to prevent paste action on parent
			return Clutter.EVENT_STOP;
		});

		this._headerTitle.connect('button-release-event', (_actor, event: Clutter.Event) => {
			if (event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
			// Stop release event too
			return Clutter.EVENT_STOP;
		});

		this._timeLabel = new TimeLabel();
		this._headerContent.add_child(this._timeLabel);

		this.buttons = new St.BoxLayout({
			style_class: 'clipboard-item-header-buttons',
			x_align: Clutter.ActorAlign.END,
			y_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
		});
		this.add_child(this.buttons);

		this._menuButton = new St.Button({
			style_class: 'clipboard-item-header-button menu-button',
			y_align: Clutter.ActorAlign.CENTER,
			child: new St.Icon({ gicon: loadIcon(ext, Icon.ViewMore) }),
		});
		this._menuButton.connect('clicked', () => {
			const box = this._menuButton.get_transformed_extents();
			this.emit('open-menu', box.get_x(), box.get_y(), box.get_width(), box.get_height());
		});
		this.buttons.add_child(this._menuButton);

		this._deleteButton = new St.Button({
			style_class: 'clipboard-item-header-button',
			y_align: Clutter.ActorAlign.CENTER,
			child: new St.Icon({ gicon: loadIcon(ext, Icon.Delete) }),
		});
		this._deleteButton.connect('clicked', () => this.emit('delete'));
		this.buttons.add_child(this._deleteButton);

		this._pinButton = new St.Button({
			style_class: 'clipboard-item-header-button',
			y_align: Clutter.ActorAlign.CENTER,
			toggle_mode: true,
			child: new St.Icon({ gicon: loadIcon(ext, Icon.Pin) }),
		});
		this.buttons.add_child(this._pinButton);

		this._tagIcon = new St.Bin({
			style_class: 'clipboard-item-tag-button',
			y_align: Clutter.ActorAlign.CENTER,
			visible: false,
			child: new St.Icon({ gicon: loadIcon(ext, Icon.Tag) }),
		});
		this.buttons.add_child(this._tagIcon);

		// Bind properties
		this.bind_property('pinned', this._pinButton, 'checked', GObject.BindingFlags.BIDIRECTIONAL);
	}

	private _startEditing() {
		if (this._isEditing) return;
		this._isEditing = true;

		// Hide the title label
		this._headerTitle.hide();

		// Create an entry for editing
		this._titleEntry = new St.Entry({
			style_class: 'clipboard-item-title-entry',
			text: this._customTitle || this._defaultTitle,
			y_align: Clutter.ActorAlign.CENTER,
		});

		// Select all text
		this._titleEntry.clutter_text.set_selection(0, -1);

		this._titleEntry.clutter_text.connect('key-press-event', (_text, event: Clutter.Event) => {
			const key = event.get_key_symbol();
			if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
				this._finishEditing(true);
				return Clutter.EVENT_STOP;
			} else if (key === Clutter.KEY_Escape) {
				this._finishEditing(false);
				return Clutter.EVENT_STOP;
			}
			return Clutter.EVENT_PROPAGATE;
		});

		this._titleEntry.clutter_text.connect('key-focus-out', () => {
			if (this._isEditing) {
				this._finishEditing(true);
			}
		});

		// Insert entry before time label
		this._headerContent.insert_child_below(this._titleEntry, this._timeLabel);
		this._titleEntry.grab_key_focus();
	}

	private _finishEditing(save: boolean) {
		if (!this._isEditing || !this._titleEntry) return;
		this._isEditing = false;

		// Capture entry reference before clearing
		const entry = this._titleEntry;
		this._titleEntry = null;

		if (save) {
			const newTitle = entry.text.trim();
			// If empty or same as default, clear custom title
			if (newTitle === '' || newTitle === this._defaultTitle) {
				this.customTitle = '';
			} else {
				this.customTitle = newTitle;
			}
		}

		// Show label first
		this._headerTitle.show();

		// Defer entry destruction to avoid crash during event handling
		GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
			entry.destroy();
			return GLib.SOURCE_REMOVE;
		});
	}

	private _updateTitleDisplay() {
		this._headerTitle.text = this._customTitle || this._defaultTitle;
	}

	get isEditing() {
		return this._isEditing;
	}

	get pinned() {
		return this._pinButton.checked;
	}

	set pinned(pinned) {
		this._pinButton.checked = pinned;
		this.updateHeaderControls();
		this.notify('pinned');
	}

	get datetime() {
		return this._timeLabel.datetime;
	}

	set datetime(datetime) {
		this._timeLabel.datetime = datetime;
		this.notify('datetime');
	}

	get forceDelete() {
		return this._forceDelete;
	}

	set forceDelete(forceDelete) {
		this._forceDelete = forceDelete;
		this.updateHeaderControls();
		this.notify('force-delete');
	}

	get protectPinned() {
		return this._protectPinned;
	}

	set protectPinned(protectPinned) {
		this._protectPinned = protectPinned;
		this.updateHeaderControls();
		this.notify('protect-pinned');
	}

	get protectTagged() {
		return this._protectTagged;
	}

	set protectTagged(protectTagged) {
		this._protectTagged = protectTagged;
		this.updateHeaderControls();
		this.notify('protect-tagged');
	}

	get headerVisible() {
		return this._headerVisible;
	}

	set headerVisible(headerVisible) {
		if (this._headerVisible === headerVisible) return;

		this._headerVisible = headerVisible;
		this.notify('header-visible');

		this.y_expand = !headerVisible;
		this._headerIcon.opacity = headerVisible ? 255 : 0;
		this._headerContent.opacity = headerVisible ? 255 : 0;
	}

	get showTitle() {
		return this._headerTitle.visible;
	}

	set showTitle(showTitle) {
		this._headerTitle.visible = showTitle;
		this.notify('show-title');
	}

	get controlsVisibility() {
		return this._controlsVisibility;
	}

	set controlsVisibility(controlsVisibility) {
		this._controlsVisibility = controlsVisibility;
		this.updateHeaderControls();
		this.notify('controls-visibility');
	}

	get tag() {
		return this._tag;
	}

	set tag(tag) {
		if (this._tag === tag) return;

		this._tag = tag;
		this.notify('tag');

		this.style_class = 'clipboard-item-header' + (tag ? ` ${tag}` : '');
		this.updateHeaderControls();
	}

	get active() {
		return this._active;
	}

	set active(active) {
		this._active = active;
		this.updateHeaderControls();
		this.notify('active');
	}

	get customTitle() {
		return this._customTitle;
	}

	set customTitle(customTitle) {
		if (this._customTitle === customTitle) return;

		this._customTitle = customTitle;
		this._updateTitleDisplay();
		this.notify('custom-title');
	}

	get defaultTitle() {
		return this._defaultTitle;
	}

	set defaultTitle(defaultTitle) {
		if (this._defaultTitle === defaultTitle) return;

		this._defaultTitle = defaultTitle;
		this._updateTitleDisplay();
		this.notify('default-title');
	}

	private updateHeaderControls() {
		let visible = true;
		if (this._controlsVisibility === HeaderControlsVisibility.VisibleOnHover) {
			visible = this.active !== ActiveState.None;
		} else if (this._controlsVisibility === HeaderControlsVisibility.Hidden) {
			visible = false;
		}

		let deleteVisible = true;
		if (((this._protectPinned && this.pinned) || (this._protectTagged && this.tag)) && !this._forceDelete) {
			deleteVisible = false;
		}

		this._pinButton.visible = visible || this.pinned;
		this._menuButton.visible = visible;
		this._deleteButton.visible = visible && deleteVisible;
		this._tagIcon.visible = this._tag !== null && !this._pinButton.visible;
	}
}
