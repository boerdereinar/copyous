import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const KEY_INTERVAL_MS = 5;

// https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator/blob/89c57703641a9d5d15f899f6e780174641911d95/keyboard.js
export class Keyboard {
	private _device: Clutter.VirtualInputDevice | null;
	private _purpose: Clutter.InputContentPurpose;
	private _pending: [number, Clutter.KeyState][] = [];
	private _sourceId: number = -1;

	constructor() {
		const backend = Clutter.get_default_backend?.() ?? global.stage.get_context().get_backend();
		const seat = backend.get_default_seat();
		this._device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
		this._purpose = (Main.inputMethod as Clutter.InputMethod).content_purpose;

		(Main.inputMethod as Clutter.InputMethod).connectObject(
			'notify::content-purpose',
			(method: { content_purpose: Clutter.InputContentPurpose }) => {
				this._purpose = method.content_purpose;
			},
			this,
		);
	}

	destroy() {
		this.flush();
		(Main.inputMethod as Clutter.InputMethod).disconnectObject(this);
		this._device = null;
	}

	get purpose() {
		return this._purpose;
	}

	private notify(keyval: number, state: Clutter.KeyState) {
		this._device?.notify_keyval(Clutter.get_current_event_time() * 1000, keyval, state);
	}

	/**
	 * Presses the keys in order, then releases them in reverse order, one event per main loop iteration.
	 *
	 * Mutter attaches the modifier state at the time of injection to each event, but also sends the live modifier state
	 * after it. When events are injected in a burst, the live state has already moved on, which makes clients see the
	 * modifiers released and pressed again between the keys.
	 */
	chord(keyvals: number[]) {
		this.flush();
		this._pending = [
			...keyvals.map((k): [number, Clutter.KeyState] => [k, Clutter.KeyState.PRESSED]),
			...keyvals.toReversed().map((k): [number, Clutter.KeyState] => [k, Clutter.KeyState.RELEASED]),
		];
		this.step();
	}

	private step() {
		const next = this._pending.shift();
		if (!next) return;
		this.notify(...next);
		if (this._pending.length === 0) return;

		this._sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, KEY_INTERVAL_MS, () => {
			this._sourceId = -1;
			this.step();
			return GLib.SOURCE_REMOVE;
		});
	}

	/** Cancels the pending timeout and sends the remaining events at once, so no key stays pressed. */
	private flush() {
		if (this._sourceId >= 0) GLib.source_remove(this._sourceId);
		this._sourceId = -1;
		for (const next of this._pending.splice(0)) this.notify(...next);
	}
}
