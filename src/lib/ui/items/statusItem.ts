import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { enumParamSpec, registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';

export const State = {
	Empty: 0,
	NoResults: 1,
} as const;

export type State = (typeof State)[keyof typeof State];

@registerClass({
	Properties: {
		state: enumParamSpec('state', GObject.ParamFlags.READWRITE, State, State.Empty),
	},
})
export class StatusItem extends St.BoxLayout {
	private _state: State;

	private readonly _emptyIcon: Gio.Icon;
	private readonly _noResultsIcon: Gio.Icon;
	private readonly _icon: St.Icon;
	private readonly _text: St.Label;

	constructor(private ext: CopyousExtension) {
		super({
			style_class: 'clipboard-item status-item',
			vertical: true,
			can_focus: false,
			width: 300,
			height: 200,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
			y_expand: true,
		});

		this._state = State.Empty;

		const box = new St.BoxLayout({
			style_class: 'status-item-content',
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
			y_expand: true,
			vertical: true,
		});
		this.add_child(box);

		this._emptyIcon = loadIcon(ext, Icon.Clipboard);
		this._noResultsIcon = loadIcon(ext, Icon.SearchClipboard);

		this._icon = new St.Icon({
			style_class: 'status-item-icon',
			gicon: this._emptyIcon,
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
		});
		box.add_child(this._icon);

		this._text = new St.Label({
			style_class: 'status-item-title',
			text: _('Clipboard is Empty'),
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
			y_expand: true,
		});
		this._text.clutter_text.line_wrap = true;
		box.add_child(this._text);

		// Bind properties
		ext.settings.connectObject(
			'changed::item-width',
			this.updateSize.bind(this),
			'changed::item-height',
			this.updateSize.bind(this),
			this,
		);

		this.updateSize();
	}

	get state(): State {
		return this._state;
	}

	set state(state: State) {
		if (this._state === state) {
			return;
		}

		this._state = state;
		this.notify('state');

		if (this.state === State.Empty) {
			this._icon.gicon = this._emptyIcon;
			this._text.text = _('Clipboard is Empty');
		} else {
			this._icon.gicon = this._noResultsIcon;
			this._text.text = _('No Items Found');
		}
	}

	private updateSize() {
		this.width = this.ext.settings.get_int('item-width');
		this.height = this.ext.settings.get_int('item-height');
	}

	override destroy() {
		this.ext.settings.disconnectObject(this);

		super.destroy();
	}
}
