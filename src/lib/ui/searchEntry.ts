import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type CopyousExtension from '../../extension.js';
import { ItemType, ItemTypes, Tag, Tags } from '../common/constants.js';
import { enumParamSpec, registerClass } from '../common/gjs.js';
import { Icon, loadIcon } from '../common/icons.js';
import { ClipboardEntry } from '../misc/db.js';
import { TagsItem } from './components/tagsItem.js';

function localeContains(text: string, query: string): boolean {
	const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
	for (let offset = 0; offset <= text.length - query.length; offset++) {
		const comparison = collator.compare(text.substring(offset, offset + query.length), query);
		if (comparison === 0) return true;
	}
	return false;
}

export const SearchChange = {
	Same: 0,
	Different: 1,
	LessStrict: 2,
	MoreStrict: 3,
} as const;

export type SearchChange = (typeof SearchChange)[keyof typeof SearchChange];

@registerClass({
	Properties: {
		'change': enumParamSpec('change', GObject.ParamFlags.READABLE, SearchChange, 0),
		'query': GObject.ParamSpec.string('query', null, null, GObject.ParamFlags.READABLE, ''),
		'pinned': GObject.ParamSpec.boolean('pinned', null, null, GObject.ParamFlags.READABLE, false),
		'exclude-pinned': GObject.ParamSpec.boolean('exclude-pinned', null, null, GObject.ParamFlags.READABLE, false),
		'tag': GObject.ParamSpec.string('tag', null, null, GObject.ParamFlags.READABLE, ''),
		'exclude-tagged': GObject.ParamSpec.boolean('exclude-tagged', null, null, GObject.ParamFlags.READABLE, false),
		'type': GObject.ParamSpec.string('type', null, null, GObject.ParamFlags.READABLE, ''),
	},
})
export class SearchQuery extends GObject.Object {
	constructor(
		readonly change: SearchChange,
		readonly query: string,
		readonly pinned: boolean,
		readonly excludePinned: boolean,
		readonly tag: Tag | null,
		readonly excludeTagged: boolean,
		readonly type: ItemType | null,
	) {
		super();
	}

	public matchesPinned(pinned: boolean): boolean {
		return (!this.pinned && !this.excludePinned) || this.pinned === pinned;
	}

	public matchesTag(tag: Tag | null): boolean {
		return (this.tag === null && !this.excludeTagged) || this.tag === tag;
	}

	public matchesType(type: ItemType): boolean {
		return this.type === null || this.type === type;
	}

	public matchesProperties(pinned: boolean, tag: Tag | null, type: ItemType): boolean {
		return this.matchesPinned(pinned) && this.matchesTag(tag) && this.matchesType(type);
	}

	public matchesQuery(...text: string[]): boolean {
		if (this.query.length === 0) return true;
		if (text.length === 0) return false;

		return text.some((s) => localeContains(s, this.query));
	}

	public matchesEntry(state: boolean, entry: ClipboardEntry, ...text: string[]): boolean {
		if (this.change === SearchChange.Same) return state;
		if (this.change === SearchChange.LessStrict && state) return true;
		if (this.change === SearchChange.MoreStrict && !state) return false;

		return this.matchesProperties(entry.pinned, entry.tag, entry.type) && this.matchesQuery(...text);
	}

	public withChange(change: SearchChange): SearchQuery {
		return new SearchQuery(
			change,
			this.query,
			this.pinned,
			this.excludePinned,
			this.tag,
			this.excludeTagged,
			this.type,
		);
	}
}

@registerClass()
class ItemPopupMenuItem extends PopupMenu.PopupMenuItem {
	private readonly _mnemonic: string | null = null;

	constructor(text: string) {
		super(text.replace(/__(.)/, (_m, s) => `<u>${s}</u>`));

		this.label.clutter_text.use_markup = true;

		// Mnemonic __.
		this._mnemonic = text.match(/__(.)/)?.[1]?.toLocaleLowerCase() ?? null;
	}

	get mnemonic() {
		return this._mnemonic;
	}
}

type ItemPopupMenuSignals = {
	'tag-changed': [Tag | null];
	'selected-changed': [ItemType | null];
	'open-state-changed': [boolean];
};

class ItemPopupMenu extends PopupMenu.PopupMenu<ItemPopupMenuSignals> {
	private readonly _tagsItem: TagsItem;
	private readonly _all: ItemPopupMenuItem;
	private readonly _options: { [type in ItemType]: ItemPopupMenuItem };
	private _selected: ItemType | null = null;

	constructor(sourceActor: St.Widget, arrowAlignment: number, arrowSide: St.Side) {
		super(sourceActor, arrowAlignment, arrowSide);

		this.actor.add_style_class_name('search-popup-menu');

		// Tags
		this._tagsItem = new TagsItem();
		this._tagsItem.connect('tag-changed', () => {
			this.close(BoxPointer.PopupAnimation.FADE);
			this.emit('tag-changed', this._tagsItem.tag);
		});
		this.addMenuItem(this._tagsItem);

		// Types
		this._all = this.addItem(_('__All'), null);
		this._all.setOrnament(PopupMenu.Ornament.CHECK);

		this._options = {
			[ItemType.Text]: this.addItem(_('__Text'), ItemType.Text),
			[ItemType.Code]: this.addItem(_('__Code'), ItemType.Code),
			[ItemType.Image]: this.addItem(_('__Image'), ItemType.Image),
			[ItemType.File]: this.addItem(_('__File'), ItemType.File),
			[ItemType.Files]: this.addItem(_('File__s'), ItemType.Files),
			[ItemType.Link]: this.addItem(_('__Link'), ItemType.Link),
			[ItemType.Character]: this.addItem(_('C__haracter'), ItemType.Character),
			[ItemType.Color]: this.addItem(_('Colo__r'), ItemType.Color),
		};

		this.actor.hide();
		Main.layoutManager.uiGroup.add_child(this.actor);

		this.actor.connect('captured-event', (_actor, event: Clutter.Event) => {
			if (event.type() === Clutter.EventType.KEY_PRESS) {
				const key = event.get_key_symbol();

				const unicode = Clutter.keysym_to_unicode(key);
				if (unicode === 0) return;

				// Select tag with number
				if (key === Clutter.KEY_0 || key === Clutter.KEY_KP_0) {
					this._tagsItem.tag = null;
					this.close(BoxPointer.PopupAnimation.FADE);
					this.emit('tag-changed', null);
					return;
				}

				const isNum = key >= Clutter.KEY_1 && key <= Clutter.KEY_9;
				if (isNum || (key >= Clutter.KEY_KP_1 && key <= Clutter.KEY_KP_9)) {
					const i = isNum ? key - Clutter.KEY_1 : key - Clutter.KEY_KP_1;
					let tag = Tags[i] ?? null;
					tag = this._tagsItem.tag === tag ? null : tag;
					this._tagsItem.tag = tag;
					this.close(BoxPointer.PopupAnimation.FADE);
					this.emit('tag-changed', tag);
					return;
				}

				// Activate the item with the mnemonic
				const char = String.fromCharCode(unicode).toLocaleLowerCase();
				for (const menuItem of [this._all, ...Object.values(this._options)]) {
					if (char === menuItem.mnemonic) {
						menuItem.activate(event);
						return;
					}
				}
			}
		});
	}

	private addItem(text: string, type: ItemType | null): ItemPopupMenuItem {
		const item = new ItemPopupMenuItem(text);
		item.setOrnament(PopupMenu.Ornament.NONE);
		item.connect('activate', () => (this.selected = type));
		this.addMenuItem(item);
		return item;
	}

	get tag() {
		return this._tagsItem.tag;
	}

	set tag(tag: Tag | null) {
		if (this._tagsItem.tag === tag) return;

		this._tagsItem.tag = tag;
		this.emit('tag-changed', tag);
	}

	get selected() {
		return this._selected;
	}

	set selected(type: ItemType | null) {
		if (this._selected === type) return;

		this._all.setOrnament(PopupMenu.Ornament.NONE);
		for (const menuItem of Object.values(this._options)) {
			menuItem.setOrnament(PopupMenu.Ornament.NONE);
		}

		if (type) {
			this._options[type].setOrnament(PopupMenu.Ornament.CHECK);
		} else {
			this._all.setOrnament(PopupMenu.Ornament.CHECK);
		}

		this._selected = type ?? null;
		this.emit('selected-changed', this._selected);
	}
}

@registerClass({
	Properties: {
		pinned: GObject.ParamSpec.boolean('pinned', null, null, GObject.ParamFlags.READWRITE, false),
		tag: GObject.ParamSpec.string('tag', null, null, GObject.ParamFlags.READWRITE, ''),
		type: GObject.ParamSpec.string('type', null, null, GObject.ParamFlags.READWRITE, ''),
	},
	Signals: {
		search: {
			param_types: [SearchQuery.$gtype],
		},
		activate: {},
	},
})
export class SearchEntry extends St.Entry {
	private _prevSearch: SearchQuery | null = null;
	private _pinned: boolean = false;
	private _tag: Tag | null = null;
	private _type: ItemType | null = null;

	private readonly _icons: { [type in ItemType | 'search']: Gio.Icon };
	private readonly _itemButton: St.Button;
	private readonly _menu: ItemPopupMenu;

	constructor(private ext: CopyousExtension) {
		super({
			style_class: 'clipboard-search-entry',
			hint_text: _('Type to search'),
			can_focus: true,
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
		});

		this._icons = {
			search: loadIcon(ext, Icon.Search),
			[ItemType.Text]: loadIcon(ext, Icon.Text),
			[ItemType.Code]: loadIcon(ext, Icon.Code),
			[ItemType.Image]: loadIcon(ext, Icon.Image),
			[ItemType.File]: loadIcon(ext, Icon.File),
			[ItemType.Files]: loadIcon(ext, Icon.Folder),
			[ItemType.Link]: loadIcon(ext, Icon.Link),
			[ItemType.Character]: loadIcon(ext, Icon.Character),
			[ItemType.Color]: loadIcon(ext, Icon.Color),
		};

		// Item button
		const left = new St.BoxLayout();
		this.primary_icon = left;
		left.connect('key-press-event', (_btn, event: Clutter.Event) => this._leftKeyPressEvent(event));

		this._itemButton = new St.Button({
			style_class: 'search-entry-button item-button',
			button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
		});
		left.add_child(this._itemButton);

		this._itemButton.connect('clicked', (_btn, button) => {
			if (button === Clutter.BUTTON_PRIMARY) {
				this._menu.toggle();
			} else if (button === Clutter.BUTTON_MIDDLE) {
				this.type = null;
				this.tag = null;
			}
		});

		const itemButtonContent = new St.BoxLayout();
		this._itemButton.add_child(itemButtonContent);

		const searchIcon = new St.Icon({
			style_class: 'search-entry-icon',
			gicon: this._icons.search,
		});
		itemButtonContent.add_child(searchIcon);
		itemButtonContent.add_child(
			new St.Icon({
				style_class: 'arrow-icon',
				icon_name: Icon.Down,
			}),
		);

		// Menu
		this._menu = new ItemPopupMenu(this._itemButton, 0.5, St.Side.TOP);

		const menuManager = new PopupMenu.PopupMenuManager(this);
		menuManager.addMenu(this._menu, 0);

		this._menu.connect('tag-changed', (_menu: unknown, tag: Tag | null) => {
			this.tag = tag;
			return undefined;
		});

		this._menu.connect('selected-changed', (_menu: unknown, type: ItemType | null) => {
			this.type = type;
			if (type) {
				searchIcon.gicon = this._icons[type];
			} else {
				searchIcon.gicon = this._icons.search;
			}
			return undefined;
		});

		// Right
		const right = new St.BoxLayout();
		this.secondary_icon = right;
		right.connect('key-press-event', (_btn, event: Clutter.Event) => this._rightKeyPressEvent(event));

		// Pin button
		const pinButton = new St.Button({
			style_class: 'search-entry-button pin-button',
			toggle_mode: true,
			child: new St.Bin({
				style_class: 'pin-button-content',
				child: new St.Icon({
					style_class: 'search-entry-icon',
					gicon: loadIcon(ext, Icon.Pin),
				}),
			}),
		});
		right.add_child(pinButton);

		// Bind properties
		pinButton.bind_property('checked', this, 'pinned', GObject.BindingFlags.BIDIRECTIONAL);

		this.ext.settings.connectObject(
			'changed::exclude-pinned',
			this.search.bind(this),
			'changed::exclude-tagged',
			this.search.bind(this),
			this,
		);

		// Connect signals
		this.connect('notify::text', this.search.bind(this));
		this.clutter_text.connect('key-press-event', (_text, event: Clutter.Event) => this._keyPressEvent(event));
	}

	get pinned() {
		return this._pinned;
	}

	set pinned(pinned: boolean) {
		this._pinned = pinned;
		this.search();
		this.notify('pinned');
	}

	get tag() {
		return this._tag;
	}

	set tag(tag: Tag | null) {
		this._tag = tag;
		this._menu.tag = tag;
		this.search();

		this._itemButton.style_class = 'search-entry-button item-button' + (tag ? ` ${tag}` : '');

		this.notify('tag');
	}

	get type() {
		return this._type;
	}

	set type(type: ItemType | null) {
		this._type = type;
		this._menu.selected = type;
		this.search();
		this.notify('type');
	}

	get searchQuery(): SearchQuery {
		const excludePinned = this.ext.settings.get_boolean('exclude-pinned');
		const excludeTagged = this.ext.settings.get_boolean('exclude-tagged');

		let change: SearchChange;
		if (!this._prevSearch) {
			change = SearchChange.Different;
		} else {
			// Query
			let queryChange: SearchChange;
			if (this.text === this._prevSearch.query) queryChange = SearchChange.Same;
			else if (this.text.includes(this._prevSearch.query)) queryChange = SearchChange.MoreStrict;
			else if (this._prevSearch.query.includes(this.text)) queryChange = SearchChange.LessStrict;
			else queryChange = SearchChange.Different;

			change = queryChange;

			// Pinned
			const prevUnpinned = this._prevSearch.matchesPinned(false);
			const prevPinned = this._prevSearch.matchesPinned(true);
			const unpinned = (!this.pinned && !excludePinned) || !this.pinned;
			const pinned = (!this.pinned && !excludePinned) || this.pinned;

			let pinnedChange: SearchChange;
			if (prevUnpinned === unpinned && prevPinned === pinned) pinnedChange = SearchChange.Same;
			else if (prevUnpinned !== unpinned && prevPinned !== pinned) pinnedChange = SearchChange.Different;
			else if ((prevUnpinned && !unpinned) || (prevPinned && !pinned)) pinnedChange = SearchChange.MoreStrict;
			else pinnedChange = SearchChange.LessStrict;

			if (pinnedChange !== SearchChange.Same)
				change =
					change === SearchChange.Same || change === pinnedChange ? pinnedChange : SearchChange.Different;

			// Tagged
			let taggedChange: SearchChange;
			if (this._prevSearch.excludeTagged !== excludeTagged) taggedChange = SearchChange.Different;
			else if (this.tag !== null) {
				if (this._prevSearch.tag === null && !excludeTagged) taggedChange = SearchChange.MoreStrict;
				else if (this._prevSearch.tag === this.tag) taggedChange = SearchChange.Same;
				else taggedChange = SearchChange.Different;
			} else {
				if (this._prevSearch.tag === null) taggedChange = SearchChange.Same;
				else if (excludeTagged) taggedChange = SearchChange.Different;
				else taggedChange = SearchChange.LessStrict;
			}

			if (taggedChange !== SearchChange.Same)
				change =
					change === SearchChange.Same || change === taggedChange ? taggedChange : SearchChange.Different;

			// Type
			let typeChange: SearchChange;
			if (this._prevSearch.type === this.type) typeChange = SearchChange.Same;
			else if (this.type === null) typeChange = SearchChange.LessStrict;
			else if (this._prevSearch.type === null) typeChange = SearchChange.MoreStrict;
			else typeChange = SearchChange.Different;

			if (typeChange !== SearchChange.Same)
				change = change === SearchChange.Same || change === typeChange ? typeChange : SearchChange.Different;
		}

		return new SearchQuery(change, this.text, this.pinned, excludePinned, this.tag, excludeTagged, this.type);
	}

	private search() {
		this._prevSearch = this.searchQuery;
		this.emit('search', this._prevSearch);
	}

	public selectTag(index: number) {
		const tag = Tags[index] ?? null;
		this.tag = this.tag === tag ? null : tag;
	}

	public nextTag() {
		this.tag = this.tag ? (Tags[Tags.indexOf(this.tag) + 1] ?? null) : Tags[0];
	}

	public prevTag() {
		this.tag = this.tag ? (Tags[Tags.indexOf(this.tag) - 1] ?? null) : Tags[Tags.length - 1]!;
	}

	public nextType() {
		this.type = this.type ? (ItemTypes[ItemTypes.indexOf(this.type) + 1] ?? null) : ItemTypes[0];
	}

	public prevType() {
		this.type = this.type
			? (ItemTypes[ItemTypes.indexOf(this.type) - 1] ?? null)
			: ItemTypes[ItemTypes.length - 1]!;
	}

	private _keyPressEvent(event: Clutter.Event) {
		const key = event.get_key_symbol();

		// Navigate focus to type button: left + left & cursor at start
		const cursor = this.clutter_text.get_cursor_position();
		const start = cursor === 0 || (this.text.length === 0 && cursor === -1);
		if ((key === Clutter.KEY_Left || key === Clutter.KEY_KP_Left) && start) {
			this.primary_icon.first_child.grab_key_focus();
			return Clutter.EVENT_STOP;
		}

		// Navigate focus to pin button: right + right & cursor at end
		const end = cursor === this.text.length || cursor === -1;
		if ((key === Clutter.KEY_Right || key === Clutter.KEY_KP_Right) && end) {
			this.secondary_icon.first_child.grab_key_focus();
			return Clutter.EVENT_STOP;
		}

		// Toggle pin: alt
		if (key === Clutter.KEY_Alt_L || key === Clutter.KEY_Alt_R || key === Clutter.KEY_ISO_Level3_Shift) {
			this.pinned = !this.pinned;
			return Clutter.EVENT_STOP;
		}

		// Clear tag/type: backspace
		if (this.text.length === 0 && key === Clutter.KEY_BackSpace) {
			this.tag = null;
			this.type = null;
			return Clutter.EVENT_STOP;
		}

		// Submit: Enter
		if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
			this.emit('activate');
			return Clutter.EVENT_STOP;
		}

		return Clutter.EVENT_PROPAGATE;
	}

	private _leftKeyPressEvent(event: Clutter.Event) {
		const key = event.get_key_symbol();
		if (key === Clutter.KEY_Right || key === Clutter.KEY_KP_Right) {
			this.clutter_text.grab_key_focus();
			return Clutter.EVENT_STOP;
		}

		return Clutter.EVENT_PROPAGATE;
	}

	private _rightKeyPressEvent(event: Clutter.Event) {
		const key = event.get_key_symbol();
		if (key === Clutter.KEY_Left || key === Clutter.KEY_KP_Left) {
			this.clutter_text.grab_key_focus();
			return Clutter.EVENT_STOP;
		}

		return Clutter.EVENT_PROPAGATE;
	}

	override vfunc_style_changed(): void {
		super.vfunc_style_changed();

		const themeNode = this.get_theme_node();
		this.natural_width = themeNode.get_max_width();
	}

	override vfunc_scroll_event(event: Clutter.Event): boolean {
		const direction = event.get_scroll_direction();
		const swap = this.ext.settings.get_boolean('swap-scroll-shortcut');
		if (direction === Clutter.ScrollDirection.UP || direction === Clutter.ScrollDirection.LEFT) {
			if (event.has_control_modifier() !== swap) {
				this.prevTag();
			} else {
				this.prevType();
			}
		} else if (direction === Clutter.ScrollDirection.DOWN || direction === Clutter.ScrollDirection.RIGHT) {
			if (event.has_control_modifier() !== swap) {
				this.nextTag();
			} else {
				this.nextType();
			}
		}

		return Clutter.EVENT_PROPAGATE;
	}

	override vfunc_unmap(): void {
		super.vfunc_unmap();

		if (!this.ext.settings.get_boolean('remember-search')) {
			this.text = '';
			this.pinned = false;
			this.tag = null;
			this.type = null;
		}
	}

	override destroy() {
		this.ext.settings.disconnectObject(this);
		this._menu.destroy();

		super.destroy();
	}
}
