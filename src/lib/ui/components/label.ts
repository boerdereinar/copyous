import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { registerClass } from '../../common/gjs.js';

interface ConstructorProps {
	tabWidth: number;
}

/**
 * Remove leading/trailing blank lines (empty lines or lines containing just spaces/tabs)
 * @param text The text to trim
 */
export function trim(text: string): string {
	return text.replace(/^([ \t]*\n)*/, '').replace(/(\n[ \t]*)*$/, '');
}

/**
 * Normalize indentation by replacing tabs with spaces and removing any leading indentation
 * @param text The text to normalize
 * @param tabWidth The number of spaces in a tab
 */
export function normalizeIndentation(text: string, tabWidth: number): string {
	// Replace tabs with spaces
	text = text.replaceAll('\t', ' '.repeat(tabWidth));

	// Remove leading indentation
	let length = Number.MAX_SAFE_INTEGER;
	for (const match of text.matchAll(/^ *(?! |$)/gm)) {
		length = Math.min(length, match[0].length);
	}

	if (length === Number.MAX_SAFE_INTEGER) return text;

	return text.replace(new RegExp('^' + ' '.repeat(length), 'gm'), '');
}

let previewSegmenter: Intl.Segmenter | undefined;

/** Bound rendering work without splitting a grapheme or changing stored text. */
export function textPreview(text: string, limit: number): string {
	if (limit <= 0 || text.length <= limit) return text;
	previewSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	const end = previewSegmenter.segment(text).containing(limit)?.index ?? limit;
	// Preserve the paragraph direction when its first strong character lies
	// beyond the preview. Direction marks are render-only, like the ellipsis.
	const separators = ['\n', '\r', '\u2029'];
	const start = Math.max(...separators.map((separator) => text.lastIndexOf(separator, end - 1))) + 1;
	const boundaries = separators.map((separator) => text.indexOf(separator, end)).filter((index) => index >= 0);
	const finish = boundaries.length > 0 ? Math.min(...boundaries) : text.length;
	let direction = Pango.find_base_dir(text.slice(start, finish), -1);
	if (direction === Pango.Direction.NEUTRAL) direction = Pango.find_base_dir(text, -1);
	const mark = direction === Pango.Direction.RTL ? '\u200f' : direction === Pango.Direction.LTR ? '\u200e' : '';
	return text.slice(0, end) + mark + '…';
}

@registerClass({
	Properties: {
		'label': GObject.ParamSpec.string('label', null, null, GObject.ParamFlags.READWRITE, ''),
		'tab-width': GObject.ParamSpec.int('tab-width', null, null, GObject.ParamFlags.READWRITE, 1, 8, 4),
	},
})
export class Label extends St.Label {
	private _tabWidth: number = 4;
	private _label: string = '';
	private _normalized = '';
	private _previewLimit = 0;

	constructor(props: Partial<St.Label.ConstructorProps> & Partial<ConstructorProps>) {
		super(props);

		const params = {
			...{ tabWidth: 4 },
			...props,
		} as ConstructorProps;

		this._tabWidth = params.tabWidth;
		this.updateLabel();
	}

	get label() {
		return this._label;
	}

	set label(text: string) {
		if (this._label === text) return;

		this._label = text;
		this.updateLabel();
		this.notify('label');
	}

	get tabWidth() {
		return this._tabWidth;
	}

	set tabWidth(tabWidth: number) {
		if (this._tabWidth === tabWidth) return;
		this._tabWidth = tabWidth;
		this.updateLabel();
		this.notify('tab-width');
	}

	public setPreviewLimit(limit: number): void {
		if (this._previewLimit === limit) return;
		this._previewLimit = limit;
		this.updatePreview();
	}

	private updateLabel() {
		// Normalize the complete text so indentation does not depend on clipping.
		this._normalized = normalizeIndentation(trim(this.label), this.tabWidth);
		this.updatePreview();
	}

	private updatePreview() {
		this.text = textPreview(this._normalized, this._previewLimit);
		this.accessible_name = this._normalized;
	}
}
