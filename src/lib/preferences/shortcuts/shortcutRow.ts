import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { registerClass } from '../../common/gjs.js';

const ShortcutLabel = ('ShortcutLabel' in Gtk && !('ShortcutLabel' in Adw) ? (Gtk as typeof Adw) : Adw).ShortcutLabel;

function isEmptyBinding(keyval: number, keycode: number, mask: Gdk.ModifierType): boolean {
	return keyval === 0 && keycode === 0 && mask === Gdk.ModifierType.NO_MODIFIER_MASK;
}

function keyvalIsForbidden(keyval: number): boolean {
	return [
		Gdk.KEY_Home,
		Gdk.KEY_Left,
		Gdk.KEY_Up,
		Gdk.KEY_Right,
		Gdk.KEY_Down,
		Gdk.KEY_Page_Up,
		Gdk.KEY_Page_Down,
		Gdk.KEY_End,
		Gdk.KEY_Tab,
		Gdk.KEY_KP_Enter,
		Gdk.KEY_Return,
		Gdk.KEY_Mode_switch,
	].includes(keyval);
}

/**
 * Based on https://gitlab.gnome.org/GNOME/gnome-control-center/-/blob/e6f6f60adaf8a5c8b151479fab7eb300deca17a6/panels/keyboard/keyboard-shortcuts.c#L245
 */
function isValidBinding(keyval: number, keycode: number, mask: Gdk.ModifierType): boolean {
	if (isEmptyBinding(keyval, keycode, mask)) {
		return false;
	}

	if ((mask === Gdk.ModifierType.NO_MODIFIER_MASK || mask === Gdk.ModifierType.SHIFT_MASK) && keycode !== 0) {
		if (
			(keyval >= Gdk.KEY_a && keyval <= Gdk.KEY_z) ||
			(keyval >= Gdk.KEY_A && keyval <= Gdk.KEY_Z) ||
			(keyval >= Gdk.KEY_0 && keyval <= Gdk.KEY_9) ||
			(keyval >= Gdk.KEY_kana_fullstop && keyval <= Gdk.KEY_semivoicedsound) ||
			(keyval >= Gdk.KEY_Arabic_comma && keyval <= Gdk.KEY_Arabic_sukun) ||
			(keyval >= Gdk.KEY_Serbian_dje && keyval <= Gdk.KEY_Cyrillic_HARDSIGN) ||
			(keyval >= Gdk.KEY_Greek_ALPHAaccent && keyval <= Gdk.KEY_Greek_omega) ||
			(keyval >= Gdk.KEY_hebrew_doublelowline && keyval <= Gdk.KEY_hebrew_taf) ||
			(keyval >= Gdk.KEY_Thai_kokai && keyval <= Gdk.KEY_Thai_lekkao) ||
			(keyval >= Gdk.KEY_Hangul_Kiyeog && keyval <= Gdk.KEY_Hangul_J_YeorinHieuh) ||
			(keyval === Gdk.KEY_space && mask === Gdk.ModifierType.NO_MODIFIER_MASK) ||
			keyvalIsForbidden(keyval)
		) {
			return false;
		}
	}

	return Gtk.accelerator_valid(keyval, mask);
}

@registerClass({
	Signals: {
		'shortcut-entered': {
			param_types: [GObject.TYPE_STRING],
		},
	},
})
class ShortcutDialog extends Adw.Dialog {
	private _shortcutsInhibited: boolean;
	private readonly _controller: Gtk.EventControllerKey;

	constructor() {
		super({
			title: _('Set Shortcut'),
			content_width: 400,
			content_height: 300,
		});

		// Setup event interruption
		this._shortcutsInhibited = false;

		this._controller = new Gtk.EventControllerKey({
			propagation_phase: Gtk.PropagationPhase.CAPTURE,
		});
		this.add_controller(this._controller);
		this._controller.connect('key-pressed', (_source, keyval, keycode, state) =>
			this.keyPressed(keyval, keycode, state),
		);

		// Set up the dialog
		const view = new Adw.ToolbarView();
		view.add_top_bar(new Adw.HeaderBar());
		this.set_child(view);

		const box = new Gtk.Box({
			hexpand: true,
			vexpand: true,
			orientation: Gtk.Orientation.VERTICAL,
			margin_start: 12,
			margin_end: 12,
			margin_bottom: 12,
			spacing: 6,
		});
		view.set_content(box);

		box.append(
			new Gtk.Picture({
				halign: Gtk.Align.CENTER,
				valign: Gtk.Align.CENTER,
				hexpand: true,
				vexpand: true,
				margin_start: 30,
				margin_end: 30,
				file: Gio.File.new_for_uri(
					'resource:///org/gnome/Shell/Extensions/copyous/images/enter-keyboard-shortcut.svg',
				),
			}),
		);

		const backToDisable = new Gtk.Box({ spacing: 6 });
		backToDisable.append(new ShortcutLabel({ accelerator: 'Back' }));
		backToDisable.append(new Gtk.Label({ label: _('Disable Shortcut') }));
		box.append(backToDisable);

		const escToCancel = new Gtk.Box({ spacing: 6 });
		escToCancel.append(new ShortcutLabel({ accelerator: 'Escape' }));
		escToCancel.append(new Gtk.Label({ label: _('Cancel') }));
		box.append(escToCancel);
	}

	/**
	 * Based on https://gitlab.gnome.org/GNOME/gnome-control-center/-/blob/e6f6f60adaf8a5c8b151479fab7eb300deca17a6/panels/keyboard/cc-keyboard-shortcut-editor.c#L651
	 */
	private keyPressed(keyval: number, keycode: number, state: Gdk.ModifierType): boolean {
		const mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;

		if (mask === 0) {
			// Cancel
			if (keyval === Gdk.KEY_Escape) {
				this.close();
				return Gdk.EVENT_STOP;
			}

			// Disable shortcut
			if (keyval === Gdk.KEY_BackSpace) {
				this.emit('shortcut-entered', '');
				this.close();
				return Gdk.EVENT_STOP;
			}
		}

		if (!isValidBinding(keyval, keycode, mask)) {
			return Gdk.EVENT_STOP;
		}

		const display = Gdk.Display.get_default();
		if (display === null) return Gdk.EVENT_STOP;

		const shortcut = Gtk.accelerator_name_with_keycode(display, keyval, keycode, mask);
		this.emit('shortcut-entered', shortcut);
		this.close();
		return Gdk.EVENT_STOP;
	}

	override vfunc_map(): void {
		super.vfunc_map();

		if (this._shortcutsInhibited) {
			return;
		}

		// Disable global shortcuts
		const surface = this.get_native()?.get_surface();
		if (surface instanceof Gdk.Toplevel) {
			surface.inhibit_system_shortcuts(null);
			this._shortcutsInhibited = true;
		}
	}

	override vfunc_unmap(): void {
		super.vfunc_unmap();

		if (!this._shortcutsInhibited) {
			return;
		}

		// Re-enable global shortcuts
		const surface = this.get_native()?.get_surface();
		if (surface instanceof Gdk.Toplevel) {
			surface.restore_system_shortcuts();
			this._shortcutsInhibited = false;
		}
	}
}

@registerClass({
	Properties: {
		shortcuts: GObject.ParamSpec.boxed('shortcuts', null, null, GObject.ParamFlags.READWRITE, GLib.strv_get_type()),
	},
})
export class ShortcutRow extends Adw.ActionRow {
	private _shortcuts: string[] = [];
	private readonly _canEdit: boolean = false;

	private readonly _shortcutLabel: Adw.ShortcutLabel;

	constructor(title: string, shortcut?: string, canEdit: boolean = false) {
		super({ title });

		this._shortcuts = shortcut?.split(' ') ?? [];

		this._shortcutLabel = new ShortcutLabel({
			valign: Gtk.Align.CENTER,
			accelerator: this._shortcuts.join(' '),
			disabled_text: _('Disabled'),
		});
		this.add_suffix(this._shortcutLabel);

		this._canEdit = canEdit;
		this.activatable = canEdit;
	}

	get shortcuts(): string[] {
		return this._shortcuts;
	}

	set shortcuts(value: string[]) {
		value = value.filter((shortcut) => shortcut !== '');

		this._shortcuts = value;
		this._shortcutLabel.set_accelerator(value.join(' '));
		this.notify('shortcuts');
	}

	override vfunc_activate() {
		if (this._canEdit) {
			const dialog = new ShortcutDialog();
			dialog.connect('shortcut-entered', (_dialog, s: string) => (this.shortcuts = [s]));
			dialog.present(this);
		}
	}
}
