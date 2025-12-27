import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { ClipboardEntry } from '../../misc/db.js';
import { TextCountMode, TextInfo } from '../components/contentInfo.js';
import { Label } from '../components/label.js';
import { ClipboardItem } from './clipboardItem.js';

@registerClass()
export class TextItem extends ClipboardItem {
	private readonly textItemSettings: Gio.Settings;

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

		this.textItemSettings.connectObject(
			'changed::show-text-info',
			this.updateTextInfo.bind(this),
			'changed::text-count-mode',
			this.updateTextInfo.bind(this),
			this,
		);

		this.ext.settings.connectObject('changed::tab-width', this.updateText.bind(this), this._text);

		entry.bind_property('content', this._text, 'label', GObject.BindingFlags.SYNC_CREATE);
		entry.connect('notify::content', this.updateTextInfo.bind(this));

		this.updateText();
		this.updateTextInfo();
	}

	private updateText() {
		this._text.tabWidth = this.ext.settings.get_int('tab-width');
	}

	private updateTextInfo() {
		const show = this.textItemSettings.get_boolean('show-text-info');
		const textCountMode = this.textItemSettings.get_enum('text-count-mode') as TextCountMode;

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

		super.destroy();
	}
}
