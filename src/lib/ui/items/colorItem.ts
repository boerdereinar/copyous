import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { Color } from '../../common/color.js';
import { ActiveState } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { ClipboardEntry } from '../../database/database.js';
import { ContentPreview } from '../components/contentPreview.js';
import { ClipboardItem } from './clipboardItem.js';

@registerClass()
export class ColorPreview extends ContentPreview {
	private readonly _effect: Clutter.BrightnessContrastEffect;

	constructor(color: string) {
		super();

		this.add_style_class_name('color-preview');

		const c = Color.parse(color)?.rgb() ?? Color.fromRgba(255, 255, 255, 1);
		const luminance = c.luminance();
		const textColor = luminance < 0.5 ? `rgba(255, 255, 255, 0.8)` : `rgba(0, 0, 0, 0.8)`;

		const colorBox = new St.Bin({
			style_class: 'color-box',
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.FILL,
			x_expand: true,
			y_expand: true,
			style: `background-color: rgb(${c.c1}, ${c.c2}, ${c.c3});`,
		});
		this.add_child(colorBox);

		const colorLabel = new St.Label({
			style_class: 'color-label',
			text: color,
			style: `color: ${textColor}`,
		});
		colorLabel.clutter_text.line_wrap = true;
		colorLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
		colorBox.add_child(colorLabel);

		this._effect = new Clutter.BrightnessContrastEffect({ enabled: false });
		colorBox.add_effect(this._effect);
	}

	set active(active: ActiveState) {
		if ((active & ActiveState.Active) > 0) {
			this._effect.set_brightness(0.2);
		} else if ((active & ActiveState.FocusHover) === (ActiveState.FocusHover as number)) {
			this._effect.set_brightness(0.1);
		} else if (active & ActiveState.Focus || active & ActiveState.Hover) {
			this._effect.set_brightness(0.05);
		} else {
			this._effect.enabled = false;
			return;
		}

		this._effect.enabled = true;
	}
}

@registerClass()
export class ColorItem extends ClipboardItem {
	constructor(ext: CopyousExtension, entry: ClipboardEntry) {
		super(ext, entry, Icon.Color, _('Color'));

		this.add_style_class_name('color-item');

		const colorPreview = new ColorPreview(entry.content.trim());
		this._content.add_child(colorPreview);

		// Hover effect
		this.connect('notify::active', () => {
			colorPreview.active = this.active;
		});
	}
}
