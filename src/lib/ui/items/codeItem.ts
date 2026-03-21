import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { ClipboardEntry, CodeMetadata } from '../../database/database.js';
import { CodeLabel } from '../components/codeLabel.js';
import { CodeInfo, TextCountMode } from '../components/contentInfo.js';
import { ClipboardItem } from './clipboardItem.js';

@registerClass()
export class CodeItem extends ClipboardItem {
	private readonly codeItemSettings: Gio.Settings;

	private readonly _code: CodeLabel;
	private _codeInfo?: CodeInfo;

	constructor(ext: CopyousExtension, entry: ClipboardEntry) {
		super(ext, entry, Icon.Code, _('Code'));

		this.codeItemSettings = this.ext.settings.get_child('code-item');

		this.add_style_class_name('code-item');

		const metadata: CodeMetadata = { language: null, ...entry.metadata } as CodeMetadata;

		this._code = new CodeLabel(ext, {
			style_class: 'code-item-content',
			language: metadata.language,
			y_align: Clutter.ActorAlign.FILL,
			y_expand: true,
		});
		this._content.add_child(this._code);

		this.codeItemSettings.connectObject(
			'changed::syntax-highlighting',
			this.updateCode.bind(this),
			'changed::show-line-numbers',
			this.updateCode.bind(this),
			'changed::show-code-info',
			this.updateCodeInfo.bind(this),
			'changed::text-count-mode',
			this.updateCodeInfo.bind(this),
			this,
		);

		this.ext.settings.connectObject('changed::tab-width', this.updateCode.bind(this), this._code);

		// Update label
		this.entry.bind_property('content', this._code, 'code', GObject.BindingFlags.SYNC_CREATE);
		this.entry.connect('notify::content', this.updateCodeInfo.bind(this));
		this.entry.connect('notify::metadata', () => {
			const m = { language: null, ...this.entry.metadata } as CodeMetadata;
			this._code.language = m.language;
			if (this._codeInfo) this._codeInfo.language = m.language?.name ?? null;
		});

		this.updateCode();
		this.updateCodeInfo();

		// Update metadata
		this._code.connect('notify::language', () => {
			this.entry.metadata = { language: this._code.language } as CodeMetadata;
		});
	}

	private updateCode() {
		this._code.syntaxHighlighting = this.codeItemSettings.get_boolean('syntax-highlighting');
		this._code.showLineNumbers = this.codeItemSettings.get_boolean('show-line-numbers');
		this._code.tabWidth = this.ext.settings.get_int('tab-width');
	}

	private updateCodeInfo() {
		const show = this.codeItemSettings.get_boolean('show-code-info');
		const textCountMode = this.codeItemSettings.get_enum('text-count-mode') as TextCountMode;

		if (this._codeInfo) {
			this._codeInfo.visible = show;
			this._codeInfo.text = this.entry.content;
			this._codeInfo.textCountMode = textCountMode;
		} else if (show) {
			const m = { language: null, ...this.entry.metadata } as CodeMetadata;
			this._codeInfo = new CodeInfo(this.entry.content, textCountMode, m.language?.name ?? null);
			this._content.add_child(this._codeInfo);
		}
	}

	override destroy() {
		this.codeItemSettings.disconnectObject(this);
		this.ext.settings.disconnectObject(this._code);

		super.destroy();
	}
}
