import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator/blob/89c57703641a9d5d15f899f6e780174641911d95/keyboard.js
export class Keyboard {
	private _device: Clutter.VirtualInputDevice | null;
	private _purpose: Clutter.InputContentPurpose;

	constructor() {
		const seat = Clutter.get_default_backend().get_default_seat();
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
		(Main.inputMethod as Clutter.InputMethod).disconnectObject(this);
		this._device = null;
	}

	get purpose() {
		return this._purpose;
	}

	private notify(keyval: number, state: Clutter.KeyState) {
		this._device?.notify_keyval(Clutter.get_current_event_time() * 1000, keyval, state);
	}

	press(keyval: number) {
		this.notify(keyval, Clutter.KeyState.PRESSED);
	}

	release(keyval: number) {
		this.notify(keyval, Clutter.KeyState.RELEASED);
	}
}
