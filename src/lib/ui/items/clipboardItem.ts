import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type CopyousExtension from '../../../extension.js';
import { ActiveState } from '../../common/constants.js';
import { flagsParamSpec, registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { MiddleClickAction } from '../../common/settings.js';
import { ClipboardEntry } from '../../database/database.js';
import { ButtonMask } from '../../misc/compatibility.js';
import { Shortcut } from '../../misc/shortcuts.js';
import { QueuedWork, WorkQueue } from '../../misc/workQueue.js';
import { HoleEffect } from '../effects/holeEffect.js';
import { SearchQuery } from '../searchEntry.js';
import { ClipboardItemHeader } from './clipboardItemHeader.js';

@registerClass({
	Properties: {
		entry: GObject.ParamSpec.object('entry', null, null, GObject.ParamFlags.READABLE, ClipboardEntry),
		active: flagsParamSpec('active', GObject.ParamFlags.READABLE, ActiveState, ActiveState.None),
	},
	Signals: {
		'activate': {},
		'activate-shift': {},
		'activate-ctrl': {},
		'activate-action': { param_types: [GObject.TYPE_STRING] },
		'edit': {},
		'open-menu': { param_types: [GObject.TYPE_INT, GObject.TYPE_INT, GObject.TYPE_INT, GObject.TYPE_INT] },
	},
})
export class ClipboardItem extends St.Button {
	private _previewForeground = false;
	private readonly _previewJobs = new Set<QueuedWork<unknown>>();
	private _protectPinned: boolean = true;
	private _protectTagged: boolean = true;
	private _middleClickAction: MiddleClickAction = MiddleClickAction.None;
	// Tracks the last applied header layout so settings changes that don't
	// affect it skip the re-parenting and layout-manager swap below.
	private _headerShown: boolean | null = null;

	private readonly _box: St.Widget;
	private readonly _header: ClipboardItemHeader;
	protected _content: St.BoxLayout;

	constructor(
		protected ext: CopyousExtension,
		readonly entry: ClipboardEntry,
		icon: Icon,
		title: string,
	) {
		super({
			style_class: 'clipboard-item',
			button_mask: ButtonMask.PRIMARY | ButtonMask.SECONDARY,
			x_expand: false,
			y_expand: false,
			track_hover: true,
			can_focus: true,
			width: 300,
			height: 200,
		});

		this.connect('destroy', () => {
			for (const job of this._previewJobs) job.cancel();
			this._previewJobs.clear();
		});

		this._box = new St.Widget({
			style_class: 'clipboard-item-box',
			x_expand: true,
			y_expand: true,
			layout_manager: new Clutter.BoxLayout({ orientation: Clutter.Orientation.VERTICAL }),
		});
		this.set_child(this._box);

		this._header = new ClipboardItemHeader(ext, icon, title);
		this._box.add_child(this._header);

		this._content = new St.BoxLayout({
			style_class: 'clipboard-item-content',
			orientation: Clutter.Orientation.VERTICAL,
			x_expand: true,
			y_expand: true,
			clip_to_allocation: true,
			effect: new HoleEffect(this._header.buttons),
		});
		this._box.add_child(this._content);

		// Bind properties
		entry.bind_property(
			'pinned',
			this._header,
			'pinned',
			GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE,
		);
		entry.bind_property('datetime', this._header, 'datetime', GObject.BindingFlags.SYNC_CREATE);
		entry.bind_property('tag', this._header, 'tag', GObject.BindingFlags.SYNC_CREATE);
		entry.bind_property(
			'title',
			this._header,
			'custom-title',
			GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE,
		);

		// prettier-ignore
		this.ext.settings.connectObject(
			'changed::item-width', this.updateSize.bind(this),
			'changed::item-height', this.updateSize.bind(this),
			'changed::dynamic-item-height', this.updateSize.bind(this),
			'changed::clipboard-orientation', this.updateSize.bind(this),
			'changed::protect-pinned', this.updateProtection.bind(this),
			'changed::protect-tagged', this.updateProtection.bind(this),
			'changed::middle-click-action', this.updateMiddleClickAction.bind(this),
			'changed::show-header', this.updateHeader.bind(this),
			'changed::show-item-title', this.updateHeader.bind(this),
			'changed::header-controls-visibility', this.updateHeader.bind(this),
			this);

		this.bind_property('active', this._header, 'active', GObject.BindingFlags.SYNC_CREATE);
		this.ext.shortcutsManager?.bind_property(
			'shift',
			this._header,
			'force-delete',
			GObject.BindingFlags.SYNC_CREATE,
		);

		this.updateSize();
		this.updateProtection();
		this.updateMiddleClickAction();
		this.updateHeader();

		// Connect signals
		this.connect('key-focus-in', () => this.prioritizePreviews());
		this.connect('notify::hover', () => this.notify('active'));
		this.connect('style-changed', () => this.notify('active'));
		this._header.connect('delete', () => this.forceDelete());
		this._header.connect('open-menu', (_, x, y, w, h) => this.emit('open-menu', x, y, w, h));
		this._header.connect('editing-finished', () => this.grab_key_focus());
	}

	protected queuePreview<T>(queue: WorkQueue, work: () => T | Promise<T>): Promise<T | undefined> {
		const job = queue.add(work);
		this._previewJobs.add(job);
		if (this._previewForeground || this.has_key_focus()) job.promote();
		return job.promise.finally(() => this._previewJobs.delete(job));
	}

	public prioritizePreviews(): void {
		this._previewForeground = true;
		for (const job of this._previewJobs) job.promote();
		for (const child of this._content.get_children()) {
			const preview = child as Clutter.Actor & { prioritizePreviews?: () => void };
			preview.prioritizePreviews?.();
		}
	}

	public deprioritizePreviews(): void {
		if (this.has_key_focus()) return;
		this._previewForeground = false;
		for (const job of this._previewJobs) job.demote();
		for (const child of this._content.get_children()) {
			const preview = child as Clutter.Actor & { deprioritizePreviews?: () => void };
			preview.deprioritizePreviews?.();
		}
	}

	get active(): ActiveState {
		this.sync_hover();
		const focus = +this.has_key_focus() * ActiveState.Focus;
		const hover = +this.hover * ActiveState.Hover;
		const active = +(this.get_style_pseudo_class()?.includes('active') ?? false) * ActiveState.Active;
		return (focus | hover | active) as ActiveState;
	}

	public search(query: SearchQuery) {
		this.visible = query.matchesEntry(this.visible, this.entry, this.entry.content);
	}

	private updateSize() {
		const width = this.ext.settings.get_int('item-width');
		const height = this.ext.settings.get_int('item-height');
		this.set_size(width, height);

		const dynamicHeight = this.ext.settings.get_boolean('dynamic-item-height');
		const orientation: Clutter.Orientation = this.ext.settings.get_enum('clipboard-orientation');
		if (dynamicHeight && orientation === Clutter.Orientation.VERTICAL) {
			this.set_height(-1);
			this.style = `max-height: ${height}px`;
		} else {
			this.style = '';
		}
	}

	private updateProtection() {
		this._protectPinned = this.ext.settings.get_boolean('protect-pinned');
		this._protectTagged = this.ext.settings.get_boolean('protect-tagged');
		this._header.protectPinned = this._protectPinned;
		this._header.protectTagged = this._protectTagged;
	}

	private updateMiddleClickAction() {
		this._middleClickAction = this.ext.settings.get_enum('middle-click-action');
		if (this._middleClickAction === MiddleClickAction.None) {
			this.button_mask &= ~ButtonMask.MIDDLE;
		} else {
			this.button_mask |= ButtonMask.MIDDLE;
		}
	}

	private updateHeader() {
		const show = this.ext.settings.get_boolean('show-header');
		this._header.headerVisible = show;
		this._header.showTitle = this.ext.settings.get_boolean('show-item-title');
		this._header.controlsVisibility = this.ext.settings.get_enum('header-controls-visibility');

		if (this._headerShown === show) return;
		this._headerShown = show;

		if (show) {
			this.remove_style_class_name('no-header');
			this._box.set_child_above_sibling(this._content, this._header);
			this._box.layout_manager = new Clutter.BoxLayout({ orientation: Clutter.Orientation.VERTICAL });
		} else {
			this.add_style_class_name('no-header');
			this._box.set_child_above_sibling(this._header, this._content);
			this._box.layout_manager = new Clutter.BinLayout();
		}
	}

	private delete() {
		if (!(this._protectPinned && this.entry.pinned) && !(this._protectTagged && this.entry.tag)) {
			this.entry.emit('delete');
		}
	}

	private forceDelete() {
		this.entry.emit('delete');
	}

	override vfunc_clicked(clicked_button: number): void {
		// Don't activate while editing the title
		if (this._header.isEditing) return;

		if (clicked_button === 1) {
			const event = Clutter.get_current_event();
			if (event.has_control_modifier()) {
				this.emit('activate-ctrl');
			} else if (event.has_shift_modifier()) {
				this.emit('activate-shift');
			} else {
				this.emit('activate');
			}
		} else if (clicked_button === 2) {
			if (this._middleClickAction === MiddleClickAction.Pin) {
				this.entry.pinned = !this.entry.pinned;
			} else if (this._middleClickAction === MiddleClickAction.Delete) {
				const event = Clutter.get_current_event();
				if (event.has_shift_modifier()) {
					this.forceDelete();
				} else {
					this.delete();
				}
			}
		} else if (clicked_button === 3) {
			const [x, y] = global.get_pointer();
			this.emit('open-menu', x, y, 0, 0);
			this.fake_release();
		}
	}

	override vfunc_key_focus_in(): void {
		super.vfunc_key_focus_in();
		this.notify('active');
	}

	override vfunc_key_focus_out(): void {
		super.vfunc_key_focus_out();
		this.notify('active');
	}

	override vfunc_key_press_event(event: Clutter.Event): boolean {
		const key = event.get_key_symbol();
		const action = this.ext.shortcutsManager?.getShortcutForKeyBinding(key, event.get_state());

		const shiftState = event.get_state() & ~Clutter.ModifierType.SHIFT_MASK;
		const shiftAction = this.ext.shortcutsManager?.getShortcutForKeyBinding(key, shiftState);

		// Pin
		if (action === Shortcut.Pin) {
			this.entry.pinned = !this.entry.pinned;
			return Clutter.EVENT_STOP;
		}

		// Delete
		if (action === Shortcut.Delete) {
			this.delete();
			return Clutter.EVENT_STOP;
		}

		// Force Delete
		if (shiftAction === Shortcut.Delete) {
			this.forceDelete();
			return Clutter.EVENT_STOP;
		}

		// Edit
		if (action === Shortcut.Edit) {
			this.emit('edit');
			return Clutter.EVENT_STOP;
		}

		// Edit Title
		if (action === Shortcut.EditTitle) {
			this._header.startEditing();
			return Clutter.EVENT_STOP;
		}

		// Menu
		if (action === Shortcut.Menu) {
			const [x, y] = this.get_transformed_position();
			this.emit('open-menu', x + 6, y, 0, 0);
			return Clutter.EVENT_STOP;
		}

		// Action
		const actionId = this.ext.shortcutsManager?.getActionForKeyBinding(key, event.get_state());
		if (actionId) this.emit('activate-action', actionId);

		return super.vfunc_key_press_event(event);
	}

	override vfunc_get_preferred_height(for_width: number): [number, number] {
		const theme = this.get_theme_node();
		const border = theme.get_border_width(St.Side.TOP) + theme.get_border_width(St.Side.BOTTOM);
		const maxHeight = theme.get_max_height();

		const [, nat] = this._box.get_preferred_height(for_width);
		const height = Math.min(nat + border, maxHeight);
		return [height, height];
	}

	override destroy() {
		for (const job of this._previewJobs) job.cancel();
		this._previewJobs.clear();
		this.ext.settings.disconnectObject(this);

		super.destroy();
	}
}
