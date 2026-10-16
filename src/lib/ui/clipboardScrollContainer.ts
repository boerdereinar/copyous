import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type CopyousExtension from '../../extension.js';
import { registerClass } from '../common/gjs.js';
import {
	get_first_visible_child,
	get_last_visible_child,
	get_next_visible_sibling,
	get_previous_visible_sibling,
} from '../misc/actor.js';
import { ClipboardItem } from './items/clipboardItem.js';
import { State, StatusItem } from './items/statusItem.js';
import { SearchChange, SearchQuery } from './searchEntry.js';

@registerClass()
export class ClipboardScrollContainer extends St.BoxLayout {
	private readonly _statusItem: StatusItem;
	private _statusItemDestroyed = false;
	private _lastFocus: Clutter.Actor | null = null;
	private _lastQuery: SearchQuery | null = null;
	private _previewOrder: ClipboardItem[] | null = null;
	private _foregroundItems = new Set<ClipboardItem>();

	constructor(ext: CopyousExtension) {
		super({
			style_class: 'clipboard-item-list',
			x_align: Clutter.ActorAlign.START,
			x_expand: false,
		});

		this._statusItem = new StatusItem(ext);
		this._statusItem.connect('destroy', () => {
			this._statusItemDestroyed = true;
		});
		this.connect('destroy', () => {
			if (!this._statusItemDestroyed) this._statusItem.destroy();
			this._previewOrder = null;
			this._foregroundItems.clear();
		});
		this.updateVisible();
	}

	override destroy() {
		this._statusItem.destroy();
		super.destroy();
	}

	private updateVisible() {
		let hasVisibleItem = false;
		for (let child = this.get_first_child(); child; child = child.get_next_sibling()) {
			if (child !== this._statusItem && child.visible) {
				hasVisibleItem = true;
				break;
			}
		}
		const statusShown = this._statusItem.get_parent() !== null;
		if (!hasVisibleItem) {
			if (!statusShown) this.add_child(this._statusItem);
			this.x_align = Clutter.ActorAlign.CENTER;
			this.x_expand = true;
			this._statusItem.state = this.get_n_children() === 1 ? State.Empty : State.NoResults;
		} else if (statusShown) {
			this.remove_child(this._statusItem);
			this.x_align = Clutter.ActorAlign.START;
			this.x_expand = false;
		}

		this.updatePseudoclasses();
	}

	private removePseudoclasses(): void {
		(get_first_visible_child(this) as St.Widget | null)?.remove_style_pseudo_class('first-child');
		(get_last_visible_child(this) as St.Widget | null)?.remove_style_pseudo_class('last-child');
	}

	private updatePseudoclasses(): void {
		(get_first_visible_child(this) as St.Widget | null)?.add_style_pseudo_class('first-child');
		(get_last_visible_child(this) as St.Widget | null)?.add_style_pseudo_class('last-child');
	}

	private nextFocus(child: Clutter.Actor, animate: boolean = true): void {
		if (child.get_parent() !== this) return;

		const newFocus = get_next_visible_sibling(child) ?? get_previous_visible_sibling(child);
		if (newFocus && newFocus !== this._statusItem) {
			this.focusChild(newFocus, animate);
		} else {
			// Navigate to the search entry
			global.focus_manager.get_group(this).grab_key_focus();
		}
	}

	public focusChild(child: Clutter.Actor, animate: boolean = true): void {
		if (child.get_parent() !== this) return;

		this._lastFocus = child;
		child.grab_key_focus();
		this.scrollToChild(child, animate);
	}

	public scrollToFocus(animate: boolean = true): void {
		for (const child of this.get_children()) {
			if (child.has_key_focus()) {
				this._lastFocus = child;
				this.scrollToChild(child, animate);
				return;
			}
		}
	}

	public scrollToChild(child: Clutter.Actor, animate: boolean = true): void {
		if (child.get_parent() !== this) return;

		const box = child.get_allocation_box();
		let adjustment: St.Adjustment;
		let value: number;
		if (this.orientation === Clutter.Orientation.HORIZONTAL) {
			adjustment = this.hadjustment;
			value = box.x1 + box.get_width() * 0.5 - adjustment.page_size * 0.5;
		} else {
			adjustment = this.vadjustment;
			value = box.y1 + box.get_height() * 0.5 - adjustment.page_size * 0.5;
		}

		if (this.text_direction === Clutter.TextDirection.RTL) {
			value = adjustment.get_upper() - adjustment.page_size - value;
		}

		// Compare the effective target, including the first/last item limits.
		value = Math.clamp(
			value,
			adjustment.lower,
			Math.max(adjustment.lower, adjustment.upper - adjustment.page_size),
		);
		if (value === adjustment.value) {
			adjustment.remove_transition('value');
			return;
		}

		if (animate) {
			// Clutter.ease replaces the current transition with the new target.
			// Do not cancel the existing animation before starting a new one.
			adjustment.ease(value, { duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
		} else {
			adjustment.remove_transition('value');
			adjustment.value = value;
		}
	}

	public addItem(item: ClipboardItem): void {
		this.insertOrMoveItem(item);

		// Tie entry callbacks to the actor so removed history cannot retain it.
		item.entry.connectObject(
			'notify::datetime',
			() => this.insertOrMoveItem(item, false),
			'delete',
			() => this.removeItem(item),
			'notify::content',
			() => this.updateSearch(item),
			'notify::pinned',
			() => this.updateSearch(item),
			'notify::tag',
			() => this.updateSearch(item),
			'notify::type',
			() => this.updateSearch(item),
			'notify::metadata',
			() => this.updateSearch(item),
			'notify::title',
			() => this.updateSearch(item),
			item,
		);
	}

	private insertOrMoveItem(item: ClipboardItem, search: boolean = true): void {
		this._previewOrder = null;
		this.removePseudoclasses();

		if (item.get_parent() === this) this.remove_child(item);

		// History arrives in timestamp order. Handle either end without copying
		// and scanning the entire actor list for every entry.
		const first = this.get_first_child();
		const last = this.get_last_child();
		if (first instanceof ClipboardItem && first.entry.datetime.compare(item.entry.datetime) <= 0) {
			this.insert_child_below(item, first);
		} else if (last instanceof ClipboardItem && last.entry.datetime.compare(item.entry.datetime) > 0) {
			this.add_child(item);
		} else {
			let sibling = first;
			while (sibling) {
				if (sibling instanceof ClipboardItem && sibling.entry.datetime.compare(item.entry.datetime) <= 0) break;
				sibling = sibling.get_next_sibling();
			}
			if (sibling) this.insert_child_below(item, sibling);
			else this.add_child(item);
		}

		// Insertion changes the list even when searching leaves this item visible.
		// Finalize status and edge styling exactly once in either case.
		if (!search || !this._lastQuery || !this.updateSearch(item)) this.updateVisible();
	}

	public clearItems(): void {
		this._previewOrder = null;
		let focus = false;
		for (const child of this.get_children()) {
			if (child instanceof ClipboardItem) {
				focus ||= child.has_key_focus();
				child.destroy();
			}
		}
		this._foregroundItems.clear();
		this._lastFocus = null;
		this.updateVisible();

		if (focus) {
			// Navigate to the search entry
			global.focus_manager.get_group(this).navigate_focus(this, St.DirectionType.UP, true);
		}
	}

	public removeItem(child: ClipboardItem): void {
		this._previewOrder = null;
		if (child.get_parent() !== this) return;

		const hasKeyFocus = child.has_key_focus();
		let newFocus = null;
		if (hasKeyFocus) {
			newFocus = get_next_visible_sibling(child) ?? get_previous_visible_sibling(child);
		}

		this._foregroundItems.delete(child);
		if (this._lastFocus === child) this._lastFocus = null;
		child.destroy();
		this.updateVisible();

		if (hasKeyFocus) {
			if (newFocus && newFocus !== this._statusItem) {
				this.focusChild(newFocus);
			} else {
				this._lastFocus = null;

				// Navigate to the search entry
				global.focus_manager.get_group(this).navigate_focus(this, St.DirectionType.UP, true);
			}
		}
	}

	public selectItem(index: number): boolean {
		let i = 0;
		for (const child of this.get_children()) {
			if (child instanceof ClipboardItem && child.visible) {
				if (i === index) {
					this.focusChild(child);
					return true;
				}

				i++;
			}
		}

		return false;
	}

	public selectNextItem() {
		let focusChild: ClipboardItem | null = null;

		for (const child of this.get_children()) {
			if (focusChild === null && child instanceof ClipboardItem && child.visible) {
				focusChild = child;
			}

			if (child.has_key_focus()) {
				this.nextFocus(child);
				return;
			}
		}

		if (focusChild !== null) {
			this.focusChild(focusChild);
		}
	}

	public search(query: SearchQuery): void {
		this._previewOrder = null;
		// Copy search query, but with SearchChange.Different to always force re-search
		this._lastQuery = query.withChange(SearchChange.Different);

		this.removePseudoclasses();
		let focusChild: ClipboardItem | null = null;
		let firstVisible: ClipboardItem | null = null;
		for (const child of this.get_children()) {
			if (child instanceof ClipboardItem) {
				const hasFocus = child.has_key_focus();
				child.search(query);
				if (hasFocus) focusChild = child;
				if (child.visible && firstVisible === null) firstVisible = child;
			}
		}
		this.updateVisible();

		if (focusChild && focusChild.visible) {
			this.focusChild(focusChild, false);
		} else if (this._lastFocus && this._lastFocus.visible) {
			this.scrollToChild(this._lastFocus, false);
		} else if (firstVisible !== null) {
			this.focusChild(firstVisible, false);
		}
	}

	private updateSearch(item: ClipboardItem): boolean {
		if (!this._lastQuery) return false;

		const hasKeyFocus = item.has_key_focus();
		const wasVisible = item.visible;
		const first = get_first_visible_child(this) as St.Widget | null;
		const last = get_last_visible_child(this) as St.Widget | null;
		item.search(this._lastQuery);
		if (item.visible === wasVisible) return false;
		first?.remove_style_pseudo_class('first-child');
		last?.remove_style_pseudo_class('last-child');
		this._previewOrder = null;
		this.updateVisible();
		if (hasKeyFocus && !item.visible) this.nextFocus(item, false);
		return true;
	}

	public prioritizePreviews(): void {
		if (!this.mapped) return;
		const horizontal = this.orientation === Clutter.Orientation.HORIZONTAL;
		const adjustment = horizontal ? this.hadjustment : this.vadjustment;
		if (adjustment.page_size <= 0) return;
		const reversed = horizontal && this.text_direction === Clutter.TextDirection.RTL;
		const start = adjustment.value;
		const end = start + adjustment.page_size;
		this._previewOrder ??= this.get_children().filter(
			(child): child is ClipboardItem => child instanceof ClipboardItem && child.visible,
		);
		const items = this._previewOrder;
		// Allocations are monotonic even with dynamic heights. Locate the viewport
		// in logarithmic time, then visit only the items that intersect it.
		let lo = 0;
		let hi = items.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			const item = items[mid]!;
			if (!item.has_allocation()) return;
			const box = item.get_allocation_box();
			if ((horizontal ? (reversed ? adjustment.upper - box.x1 : box.x2) : box.y2) <= start) lo = mid + 1;
			else hi = mid;
		}
		const foreground = new Set<ClipboardItem>();
		for (let i = lo; i < items.length; i++) {
			const item = items[i]!;
			if (!item.has_allocation()) break;
			const box = item.get_allocation_box();
			if ((horizontal ? (reversed ? adjustment.upper - box.x2 : box.x1) : box.y1) >= end) break;
			foreground.add(item);
		}
		for (const item of this._foregroundItems) {
			if (!foreground.has(item)) item.deprioritizePreviews();
		}
		for (const item of foreground) item.prioritizePreviews();
		this._foregroundItems = foreground;
	}

	override vfunc_allocate(box: Clutter.ActorBox): void {
		super.vfunc_allocate(box);
		this.prioritizePreviews();
	}

	public activateFirst(): void {
		const first = get_first_visible_child(this);
		if (first instanceof St.Button) {
			first.vfunc_clicked(1);
		}
	}

	override vfunc_navigate_focus(from: Clutter.Actor | null, direction: St.DirectionType): boolean {
		// Navigation from the search entry
		if (from?.get_parent() !== this) {
			// If tab navigation is used, then focus on first or last child
			if (direction === St.DirectionType.TAB_FORWARD || direction === St.DirectionType.TAB_BACKWARD) {
				this._lastFocus = null;
				const child =
					direction === St.DirectionType.TAB_BACKWARD
						? get_last_visible_child(this)
						: get_first_visible_child(this);
				if (child !== this._statusItem) {
					this._lastFocus = child;
				}
			}

			// If the last focus is null or not visible, then focus the first visible child
			if (this._lastFocus === null || !this._lastFocus.visible || this._lastFocus.get_parent() !== this) {
				this._lastFocus = null;
				const child = get_first_visible_child(this);
				if (child !== this._statusItem) {
					this._lastFocus = child;
				}
			}

			// Navigate to the search entry
			if (!this._lastFocus) return Clutter.EVENT_PROPAGATE;

			this._lastFocus.grab_key_focus();
			this.scrollToChild(this._lastFocus);
			return Clutter.EVENT_STOP;
		}

		const first = get_first_visible_child(this);
		const last = get_last_visible_child(this);
		if (this.orientation === Clutter.Orientation.HORIZONTAL) {
			// If up or shift tab navigation then focus the search entry
			if (direction === St.DirectionType.UP) {
				this._lastFocus = from;
				// Navigate to the search entry
				return Clutter.EVENT_PROPAGATE;
			}

			// Ignore down navigation
			if (direction === St.DirectionType.DOWN) {
				return Clutter.EVENT_STOP;
			}
		} else {
			// If on the first child then focus the search entry
			if (from === first && direction === St.DirectionType.UP) {
				this._lastFocus = from;
				// Navigate to the search entry
				return Clutter.EVENT_PROPAGATE;
			}

			// If on the last child then focus on footer
			if (from === last && direction === St.DirectionType.DOWN) {
				this._lastFocus = from;
				return Clutter.EVENT_PROPAGATE;
			}

			// Ignore left and right navigation
			if (direction === St.DirectionType.LEFT || direction === St.DirectionType.RIGHT) {
				return Clutter.EVENT_STOP;
			}
		}

		// If on first child and shift tab navigation then focus the search entry
		if (from === first && direction === St.DirectionType.TAB_BACKWARD) {
			this._lastFocus = from;
			// Navigate to the search entry
			return Clutter.EVENT_PROPAGATE;
		}

		// If on last child and tab navigation then focus the footer
		if (from === last && direction === St.DirectionType.TAB_FORWARD) {
			this._lastFocus = from;
			// Navigate to footer
			return Clutter.EVENT_PROPAGATE;
		}

		// Otherwise map navigation to tab navigation due to weird behavior for a larger number of items
		const tabDirection =
			direction === St.DirectionType.TAB_FORWARD ||
			direction === St.DirectionType.RIGHT ||
			direction === St.DirectionType.DOWN
				? St.DirectionType.TAB_FORWARD
				: St.DirectionType.TAB_BACKWARD;
		const res = super.vfunc_navigate_focus(from, tabDirection);
		this.scrollToFocus();
		return res;
	}

	override vfunc_map(): void {
		this._lastFocus = null;
		this.hadjustment.value = 0;
		this.vadjustment.value = 0;

		super.vfunc_map();
	}
}
