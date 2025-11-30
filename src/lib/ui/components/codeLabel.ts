import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import type CopyousExtension from '../../../extension.js';
import { registerClass } from '../../common/gjs.js';
import { Language } from '../../misc/db.js';
import { ColorScheme } from '../../misc/theme.js';
import { normalizeIndentation, trim } from './label.js';

// https://gitlab.gnome.org/GNOME/gtksourceview/-/blob/master/data/styles/Adwaita-dark.xml
// https://gitlab.gnome.org/GNOME/gtksourceview/-/blob/master/data/styles/Adwaita.xml
const Colors = {
	'blue_1': '#99C1F1',
	'blue_2': '#62A0EA',
	'blue_3': '#3584E4',
	'blue_4': '#1C71D8',
	'blue_5': '#1A5FB4',
	'blue_6': '#1B497E',
	'blue_7': '#193D66',
	'brown_1': '#CDAB8F',
	'brown_2': '#B5835A',
	'brown_3': '#986A44',
	'brown_4': '#865E3C',
	'brown_5': '#63452C',
	'chameleon_3': '#4E9A06',
	'dark_1': '#777777',
	'dark_2': '#5E5E5E',
	'dark_3': '#505050',
	'dark_4': '#3D3D3D',
	'dark_5': '#242424',
	'dark_6': '#121212',
	'dark_7': '#000000',
	'green_1': '#8FF0A4',
	'green_2': '#57E389',
	'green_3': '#33D17A',
	'green_4': '#2EC27E',
	'green_5': '#26A269',
	'green_6': '#1F7F56',
	'green_7': '#1C6849',
	'libadwaita-dark': '#1d1d20',
	'libadwaita-dark-alt': '#242428',
	'light_1': '#FFFFFF',
	'light_2': '#FCFCFC',
	'light_3': '#F6F5F4',
	'light_4': '#DEDDDA',
	'light_5': '#C0BFBC',
	'light_6': '#B0AFAC',
	'light_7': '#9A9996',
	'orange_1': '#FFBE6F',
	'orange_2': '#FFA348',
	'orange_3': '#FF7800',
	'orange_4': '#E66100',
	'orange_5': '#C64600',
	'purple_1': '#DC8ADD',
	'purple_2': '#C061CB',
	'purple_3': '#9141AC',
	'purple_4': '#813D9C',
	'purple_5': '#613583',
	'red_1': '#F66151',
	'red_2': '#ED333B',
	'red_3': '#E01B24',
	'red_4': '#C01C28',
	'red_5': '#A51D2D',
	'teal_1': '#93DDC2',
	'teal_2': '#5BC8AF',
	'teal_3': '#33B2A4',
	'teal_4': '#26A1A2',
	'teal_5': '#218787',
	'violet_2': '#7D8AC7',
	'violet_3': '#6362C8',
	'violet_4': '#4E57BA',
	'yellow_1': '#F9F06B',
	'yellow_2': '#F8E45C',
	'yellow_3': '#F6D32D',
	'yellow_4': '#F5C211',
	'yellow_5': '#E5A50A',
	'yellow_6': '#D38B09',
};

// https://highlightjs.readthedocs.io/en/latest/css-classes-reference.html
const Dark = {
	// General purpose
	'keyword': { fgcolor: 'orange_2', weight: 'bold' },
	'built_in': { fgcolor: 'teal_2', weight: 'bold' },
	'type': { fgcolor: 'teal_2', weight: 'bold' },
	'literal': { fgcolor: 'violet_2' },
	'number': { fgcolor: 'violet_2' },
	'operator': {},
	'punctuation': {},
	'property': { fgcolor: 'orange_2', weight: 'bold' },
	'regexp': { fgcolor: 'teal_2' },
	'string': { fgcolor: 'teal_2' },
	'char.escape_': { fgcolor: 'red_1' },
	'subst': { fgcolor: 'orange_4' },
	'symbol': {},
	'class': {},
	'function': {},
	'variable': { fgcolor: 'teal_2', weight: 'bold' },
	'variable.language_': { fgcolor: 'orange_2', weight: 'bold' },
	'variable.constant_': {},
	'title': {},
	'title.class_': {},
	'title.class_.inherited__': {},
	'title.function_': {},
	'title.function_.invoke__': {},
	'params': {},
	'comment': { fgcolor: 'dark_1' },
	'doctag': { fgcolor: 'light_7' },
	// Meta
	'meta': { fgcolor: 'violet_2' }, // orange_3
	'meta.prompt': { fgcolor: 'yellow_4' },
	// Tags, attributes, configs
	'section': { fgcolor: 'teal_3', weight: 'bold' },
	'tag': { fgcolor: 'teal_3' },
	'name': { fgcolor: 'teal_3' },
	'attr': { fgcolor: 'orange_3' },
	'attribute': { fgcolor: 'orange_3' },
	// Text markup
	'bullet': { fgcolor: 'orange_4', weight: 'bold' },
	'code': { fgcolor: 'violet_2' },
	'emphasis': { style: 'italic' },
	'strong': { weight: 'bold' },
	'formula': {},
	'link': { underline: 'single' },
	'quote': { fgcolor: 'dark_1' },
	// Css
	'selector-tag': { fgcolor: 'teal_3' },
	'selector-id': { fgcolor: 'teal_3', weight: 'bold' },
	'selector-class': { fgcolor: 'chameleon_3' },
	'selector-attr': { fgcolor: 'teal_3' },
	'selector-pseudo': { fgcolor: 'violet_2', weight: 'bold' },
	// Templates
	'template-tag': { fgcolor: 'violet_2' },
	'template-variable': { fgcolor: 'violet_2' },
	// Diff
	'addition': { fgcolor: 'teal_3' },
	'deletion': { fgcolor: 'red_1' },
};

const Light = {
	// General purpose
	'keyword': { fgcolor: 'orange_5', weight: 'bold' },
	'built_in': { fgcolor: 'teal_5', weight: 'bold' },
	'type': { fgcolor: 'teal_5', weight: 'bold' },
	'literal': { fgcolor: 'violet_4' },
	'number': { fgcolor: 'violet_4' },
	'operator': {},
	'punctuation': {},
	'property': { fgcolor: 'orange_5', weight: 'bold' },
	'regexp': { fgcolor: 'teal_5' },
	'string': { fgcolor: 'teal_5' },
	'char.escape_': { fgcolor: 'red_2' },
	'subst': { fgcolor: 'orange_5' },
	'symbol': {},
	'class': {},
	'function': {},
	'variable': { fgcolor: 'teal_5', weight: 'bold' },
	'variable.language_': { fgcolor: 'orange_5', weight: 'bold' },
	'variable.constant_': {},
	'title': {},
	'title.class_': {},
	'title.class_.inherited__': {},
	'title.function_': {},
	'title.function_.invoke__': {},
	'params': {},
	'comment': { fgcolor: 'dark_1' },
	'doctag': { fgcolor: 'dark_3' },
	// Meta
	'meta': { fgcolor: 'violet_4' }, // orange_3
	'meta.prompt': { fgcolor: 'yellow_6' },
	// Tags, attributes, configs
	'section': { fgcolor: 'teal_5', weight: 'bold' },
	'tag': { fgcolor: 'teal_5' },
	'name': { fgcolor: 'teal_5' },
	'attr': { fgcolor: 'orange_5' },
	'attribute': { fgcolor: 'orange_5' },
	// Text markup
	'bullet': { fgcolor: 'orange_5', weight: 'bold' },
	'code': { fgcolor: 'violet_4' },
	'emphasis': { style: 'italic' },
	'strong': { weight: 'bold' },
	'formula': {},
	'link': { underline: 'single' },
	'quote': { fgcolor: 'dark_1' },
	// Css
	'selector-tag': { fgcolor: 'teal_5' },
	'selector-id': { fgcolor: 'teal_5', weight: 'bold' },
	'selector-class': { fgcolor: 'chameleon_3' },
	'selector-attr': { fgcolor: 'teal_5' },
	'selector-pseudo': { fgcolor: 'violet_4', weight: 'bold' },
	// Templates
	'template-tag': { fgcolor: 'violet_4' },
	'template-variable': { fgcolor: 'violet_4' },
	// Diff
	'addition': { fgcolor: 'teal_4' },
	'deletion': { fgcolor: 'red_1' },
};

export interface CodeLabelConstructorProps {
	code: string;
	language: Language | null;
	syntaxHighlighting: boolean;
	showLineNumbers: boolean;
	tabWidth: number;
}

/**
 * Applies a theme to highlight.js output
 * @param colorScheme the color scheme
 * @param highlighted the highlighted highlight.js output
 */
export function applyTheme(colorScheme: ColorScheme | undefined, highlighted: string): string {
	const theme = colorScheme === ColorScheme.Light ? Light : Dark;
	return highlighted.replace(/class="([^"]*)"/gm, (_, classes: string) => {
		if (!classes.startsWith('hljs-')) return '';

		const id = classes.substring(5).replace(' ', '.');
		const style = theme[id as keyof typeof theme];
		if (style) {
			return Object.entries(style)
				.map(([key, value]) => {
					value = Colors[value as keyof typeof Colors] ?? value;
					return `${key}="${value}"`;
				})
				.join(' ');
		}

		return '';
	});
}

@registerClass({
	Properties: {
		'code': GObject.ParamSpec.string('code', null, null, GObject.ParamFlags.READWRITE, ''),
		'language': GObject.ParamSpec.jsobject('language', null, null, GObject.ParamFlags.READWRITE),
		'syntax-highlighting': GObject.ParamSpec.boolean(
			'syntax-highlighting',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			true,
		),
		'show-line-numbers': GObject.ParamSpec.boolean(
			'show-line-numbers',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			true,
		),
		'tab-width': GObject.ParamSpec.int('tab-width', null, null, GObject.ParamFlags.READWRITE, 1, 8, 4),
	},
})
export class CodeLabel extends St.Label {
	private readonly _colorSchemeChangedId: number = -1;

	private _code: string = '';
	private _language: Language | null = null;
	private _tabWidth = 4;
	private _syntaxHighlighting = true;
	private _showLineNumbers = true;

	private _highlighted: string = '';

	public constructor(
		private ext: CopyousExtension,
		props: Partial<St.Label.ConstructorProps & CodeLabelConstructorProps>,
	) {
		super({ ...props, min_height: 0, clip_to_allocation: true });
		this.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
		this.clutter_text.ellipsize = Pango.EllipsizeMode.END;

		const params = {
			...{ code: '', language: '', syntaxHighlighting: true, showLineNumbers: true, tabWidth: 4 },
			...props,
		} as CodeLabelConstructorProps;
		this._code = params.code;
		this._language = params.language;
		this._syntaxHighlighting = params.syntaxHighlighting;
		this._showLineNumbers = params.showLineNumbers;
		this._tabWidth = params.tabWidth;

		// Update text when global color scheme changes
		if (this.ext.themeManager) {
			this._colorSchemeChangedId = this.ext.themeManager?.connect(
				'notify::color-scheme',
				this.updateText.bind(this),
			);
		}

		// Update text after hljs is loaded
		this.ext.connectHljsInit(this.updateText.bind(this));

		this.updateText();
	}

	override destroy(): void {
		if (this._colorSchemeChangedId >= 0) {
			this.ext.themeManager?.disconnect(this._colorSchemeChangedId);
		}

		super.destroy();
	}

	get code() {
		return this._code;
	}

	set code(code: string) {
		if (this._code === code) return;
		this._code = code;
		this.updateText();
		this.notify('code');
	}

	get language() {
		return this._language;
	}

	set language(language: Language | null) {
		if (this._language === language) return;
		this._language = language;
		this.updateText();
		this.notify('language');
	}

	get syntaxHighlighting() {
		return this._syntaxHighlighting;
	}

	set syntaxHighlighting(syntaxHighlighting: boolean) {
		if (this._syntaxHighlighting === syntaxHighlighting) return;
		this._syntaxHighlighting = syntaxHighlighting;
		this.updateText();
		this.notify('syntax-highlighting');
	}

	get showLineNumbers() {
		return this._showLineNumbers;
	}

	set showLineNumbers(showLineNumbers: boolean) {
		if (this._showLineNumbers === showLineNumbers) return;
		this._showLineNumbers = showLineNumbers;
		this.updateLabel();
		this.notify('show-line-numbers');
	}

	get tabWidth() {
		return this._tabWidth;
	}

	set tabWidth(tabWidth: number) {
		if (this._tabWidth === tabWidth) return;
		this._tabWidth = tabWidth;
		this.updateText();
		this.notify('tab-width');
	}

	private updateText() {
		if (this._code == null) return;

		// Trim indentation before highlighting to prevent empty lines
		let text = normalizeIndentation(trim(this._code), this.tabWidth);
		if (this.syntaxHighlighting && this.ext.hljs != null) {
			const language =
				this.language && this.ext.hljs.getLanguage(this.language.id) != null ? this.language.id : null;

			const result = language ? this.ext.hljs.highlight(text, { language }) : this.ext.hljs.highlightAuto(text);
			text = applyTheme(this.ext.themeManager?.colorScheme, result.value);

			// Store language
			if (!language && result.language) {
				const id = result.language;
				const name = this.ext.hljs.getLanguage(id)?.name ?? id;

				this._language = { id, name: id.length < name.length - 3 ? id.charAt(0) + id.slice(1) : name };
				this.notify('language');
			}
		} else {
			text = GLib.markup_escape_text(text, text.length);
		}

		this._highlighted = text;
		this.updateLabel();
	}

	private updateLabel() {
		let text = this._highlighted;
		const lines = this._highlighted.split('\n');
		this.clutter_text.line_wrap = lines.length === 1;

		if (this.showLineNumbers && lines.length > 1) {
			// Add line numbers
			const color = this.ext.themeManager?.colorScheme ? Colors.dark_7 : Colors.light_1;
			const span = `<span color="${color}" alpha="50%">`;
			text = lines.map((l, i) => `${span}${i.toString().padEnd(2, ' ')}</span> ${l}`).join('\n');
		}

		// Add blank line to fix the first span not being styled
		this.clutter_text.set_markup('\n' + text);
	}

	override vfunc_allocate(box: Clutter.ActorBox): void {
		this.set_allocation(box);

		const themeNode = this.get_theme_node();
		const contentBox = themeNode.get_content_box(box);
		const scale = this.get_resource_scale();

		// Shift one line up to account for extra blank line
		const layout = this.clutter_text.get_layout();
		const line = layout.get_line_readonly(0);
		const offset = line ? line.get_height() / Pango.SCALE / scale : 0;
		contentBox.y1 -= offset;

		// Fit label to content box without partial clipping
		let y = contentBox.y1;
		for (const l of layout.get_lines_readonly()) {
			const [, extents] = l.get_extents();
			const height = (extents?.height ?? 0) / Pango.SCALE / scale;
			if (y + height <= contentBox.y2) {
				y += height;
			} else {
				contentBox.y2 = Math.ceil(y);
				break;
			}
		}

		this.clutter_text.allocate(contentBox);
	}
}
