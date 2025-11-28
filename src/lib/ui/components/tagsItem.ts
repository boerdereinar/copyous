import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Tag, Tags } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';

@registerClass()
class TagButton extends St.Button {
	constructor(tag: Tag) {
		super({
			style_class: `tag-button ${tag}`,
			y_align: Clutter.ActorAlign.CENTER,
			toggle_mode: true,
			can_focus: true,
		});

		this.child = new St.Bin({
			style_class: 'inner',
			child: new St.Bin({
				style_class: 'tag',
			}),
		});
	}

	override vfunc_key_press_event(event: Clutter.Event): boolean {
		const key = event.get_key_symbol();
		if (key === Clutter.KEY_Left || key === Clutter.KEY_Right) {
			const direction = key === Clutter.KEY_Left ? St.DirectionType.LEFT : St.DirectionType.RIGHT;
			(this.get_parent() as St.Widget).navigate_focus(this, direction, true);
			return Clutter.EVENT_STOP;
		}

		return super.vfunc_key_press_event(event);
	}
}

@registerClass()
class TagsBox extends St.BoxLayout {
	public scrollToChild(child: Clutter.Actor, animate: boolean = true): void {
		const allocation = child.get_allocation_box();
		const rtl = this.text_direction === Clutter.TextDirection.RTL;
		const x = !rtl ? allocation.x1 : this.hadjustment.upper - allocation.x2;

		if (this.hadjustment.value <= x && x < this.hadjustment.value + this.hadjustment.page_size) return;

		const page = Math.floor(x / this.hadjustment.page_size);
		const value = Math.min(page * this.hadjustment.page_size, this.hadjustment.upper - this.hadjustment.page_size);
		if (isNaN(value)) return;

		if (animate) {
			this.hadjustment.ease(value, { duration: 150, mode: Clutter.AnimationMode.LINEAR });
		} else {
			this.hadjustment.value = value;
		}
	}

	public previousPage() {
		// Scroll to start of page if partially on page
		const page = Math.ceil(this.hadjustment.value / this.hadjustment.page_size);
		const value = Math.max(page - 1, 0) * this.hadjustment.page_size;

		this.hadjustment.ease(value, { duration: 150, mode: Clutter.AnimationMode.LINEAR });
	}

	public nextPage() {
		const page = Math.floor(this.hadjustment.value / this.hadjustment.page_size);
		const value = Math.min(
			(page + 1) * this.hadjustment.page_size,
			this.hadjustment.upper - this.hadjustment.page_size,
		);

		this.hadjustment.ease(value, { duration: 150, mode: Clutter.AnimationMode.LINEAR });
	}

	override vfunc_navigate_focus(from: Clutter.Actor | null, direction: St.DirectionType): boolean {
		let res: boolean;
		if (this.first_child === from && direction === St.DirectionType.LEFT) {
			this.last_child.grab_key_focus();
			res = Clutter.EVENT_STOP;
		} else {
			res = super.vfunc_navigate_focus(from, direction);
		}

		for (const child of this.get_children()) {
			if (child.has_key_focus()) {
				this.scrollToChild(child);
				break;
			}
		}

		return res;
	}
}

@registerClass({
	Properties: {
		tag: GObject.ParamSpec.string('tag', null, null, GObject.ParamFlags.READWRITE, ''),
	},
	Signals: {
		'tag-changed': {},
	},
})
export class TagsItem extends PopupMenu.PopupBaseMenuItem {
	private _tag: Tag | null = null;

	private readonly _tagsBox: TagsBox;
	private readonly _leftArrow: St.Button;
	private readonly _rightArrow: St.Button;

	constructor() {
		super({
			style_class: 'tags-item',
			activate: false,
		});
		this.track_hover = false;

		// Left arrow
		this._leftArrow = new St.Button({
			icon_name: Icon.Left,
			style_class: 'popup-menu-item arrow-button',
			reactive: false,
		});
		this.actor.add_child(this._leftArrow);

		// Tags
		const scrollView = new St.ScrollView({
			style_class: 'tags-scrollview',
			x_expand: true,
		});
		this.actor.add_child(scrollView);

		this._tagsBox = new TagsBox({ x_expand: true });
		Tags.forEach((tag) => this.addTag(tag));
		scrollView.child = this._tagsBox;

		this._tagsBox.hadjustment.connect('notify::value', this.updateButtons.bind(this));
		this._tagsBox.hadjustment.connect('changed', this.updateButtons.bind(this));

		// Right arrow
		this._rightArrow = new St.Button({
			icon_name: Icon.Right,
			style_class: 'popup-menu-item arrow-button',
		});
		this.actor.add_child(this._rightArrow);

		// Connect events
		scrollView.connect('scroll-event', (_actor, event: Clutter.Event) => {
			if (this._tagsBox.hadjustment.get_transition('value')) return;

			switch (event.get_scroll_direction()) {
				case Clutter.ScrollDirection.UP:
				case Clutter.ScrollDirection.LEFT:
					this._tagsBox.previousPage();
					break;
				case Clutter.ScrollDirection.DOWN:
				case Clutter.ScrollDirection.RIGHT:
					this._tagsBox.nextPage();
					break;
			}
		});

		this._leftArrow.connect('clicked', () => this._tagsBox.previousPage());
		this._rightArrow.connect('clicked', () => this._tagsBox.nextPage());
	}

	get tag(): Tag | null {
		return this._tag;
	}

	set tag(tag: Tag | null) {
		if (this._tag === tag) return;
		this._tag = tag;

		const index = tag ? Tags.indexOf(tag) : -1;
		for (const [i, btn] of (this._tagsBox.get_children() as St.Button[]).entries()) {
			if (i === index) {
				btn.checked = true;
				this._tagsBox.scrollToChild(btn, false);
			} else {
				btn.checked = false;
			}
		}

		if (index === -1) {
			this._tagsBox.hadjustment.value = 0;
		}

		this.notify('tag');
	}

	private addTag(tag: Tag) {
		const button = new TagButton(tag);
		this._tagsBox.add_child(button);

		button.connect('clicked', () => {
			for (const btn of this._tagsBox.get_children() as St.Button[]) {
				if (btn !== button) btn.checked = false;
			}

			this._tag = button.checked ? tag : null;
			this.emit('tag-changed');
			this.notify('tag');
		});
	}

	private updateButtons() {
		const hadjustment = this._tagsBox.hadjustment;
		this._leftArrow.reactive = hadjustment.value > 0;
		this._rightArrow.reactive = hadjustment.value < hadjustment.upper - hadjustment.page_size;

		if (!this._leftArrow.reactive) this._leftArrow.remove_style_pseudo_class('hover');
		if (!this._rightArrow.reactive) this._rightArrow.remove_style_pseudo_class('hover');
	}

	override vfunc_key_focus_in(): void {
		const index = this._tag ? Tags.indexOf(this._tag) : -1;
		const button = this._tagsBox.get_child_at_index(index) ?? this._tagsBox.first_child;
		button.grab_key_focus();
		this._tagsBox.scrollToChild(button);
	}

	override vfunc_key_press_event(event: Clutter.Event): boolean {
		// Workaround for activate: false disabling wrap navigation
		let state = event.get_state();
		state &= ~Clutter.ModifierType.LOCK_MASK;
		state &= ~Clutter.ModifierType.MOD2_MASK;
		state &= Clutter.ModifierType.MODIFIER_MASK;
		if (state) return Clutter.EVENT_PROPAGATE;

		const key = event.get_key_symbol();
		if (key === Clutter.KEY_Up) {
			const group = global.focus_manager.get_group(this);
			if (group?.navigate_focus(this, St.DirectionType.UP, true)) return Clutter.EVENT_STOP;
		}

		return super.vfunc_key_press_event(event);
	}

	override vfunc_map(): void {
		super.vfunc_map();

		const index = this._tag ? Tags.indexOf(this._tag) : -1;
		const button = this._tagsBox.get_child_at_index(index) ?? this._tagsBox.first_child;
		this._tagsBox.scrollToChild(button, false);
	}
}
