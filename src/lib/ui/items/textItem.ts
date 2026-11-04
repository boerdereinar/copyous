import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { TextItemSettings } from '../../common/settings.js';
import { ClipboardEntry } from '../../database/database.js';
import { TextInfo } from '../components/contentInfo.js';
import { Label } from '../components/label.js';
import { ClipboardItem } from './clipboardItem.js';

@registerClass()
export class TextItem extends ClipboardItem {
	private readonly textItemSettings: TextItemSettings;

	private readonly _text: Label;
	private _textInfo?: TextInfo;

	constructor(ext: CopyousExtension, entry: ClipboardEntry) {
		super(ext, entry, Icon.Text, _('Text'));

		this.textItemSettings = this.ext.settings.get_child('text-item');

		this.add_style_class_name('text-item');

		this._text = new Label({
			style_class: 'text-item-content',
			y_align: Clutter.ActorAlign.FILL,
			y_expand: true,
			min_height: 0,
		});
		this._text.clutter_text.line_wrap = true;
		this._text.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
		this._content.add_child(this._text);

		this.textItemSettings.connectObject('changed', this.updateTextInfo.bind(this), this);
		this.ext.settings.connectObject(
			'changed::tab-width',
			this.updateText.bind(this),
			'changed::item-width',
			this.updateText.bind(this),
			'changed::item-height',
			this.updateText.bind(this),
			this._text,
		);

		this.updateText();
		entry.bind_property('content', this._text, 'label', GObject.BindingFlags.SYNC_CREATE);
		entry.connectObject('notify::content', this.updateTextInfo.bind(this), this);

		this.updateTextInfo();
	}

	private updateText() {
		this._text.tabWidth = this.ext.settings.get_int('tab-width');
		// The card cannot scroll its text. Keep generous space beyond the visible
		// area, growing with both supported card dimensions, without laying out
		// arbitrarily large clipboard contents whenever Clutter's cache is cold.
		const width = this.ext.settings.get_int('item-width');
		const height = this.ext.settings.get_int('item-height');
		this._text.setPreviewLimit(Math.max(4096, Math.ceil((width * height) / 16)));
	}

	private updateTextInfo() {
		const show = this.textItemSettings.get_boolean('show-text-info');
		const textCountMode = this.textItemSettings.get_enum('text-count-mode');

		if (this._textInfo) {
			this._textInfo.visible = show;
			this._textInfo.text = this.entry.content;
			this._textInfo.textCountMode = textCountMode;
		} else if (show) {
			this._textInfo = new TextInfo(this.entry.content, textCountMode);
			this._content.add_child(this._textInfo);
		}
	}

	override destroy() {
		this.textItemSettings.disconnectObject(this);
		this.ext.settings.disconnectObject(this._text);
		this.entry.disconnectObject(this);

		super.destroy();
	}
}
