import GObject from 'gi://GObject';
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

@registerClass({
	Properties: {
		'label': GObject.ParamSpec.string('label', null, null, GObject.ParamFlags.READWRITE, ''),
		'tab-width': GObject.ParamSpec.int('tab-width', null, null, GObject.ParamFlags.READWRITE, 1, 8, 4),
	},
})
export class Label extends St.Label {
	private _tabWidth: number = 4;
	private _label: string = '';

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

	private updateLabel() {
		this.text = normalizeIndentation(trim(this.label), this.tabWidth);
	}
}
