import Gio from 'gi://Gio';

import type { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export const Icon = {
	// Icon Files
	Character: 'character-symbolic',
	CheckOutline: 'check-round-outline-symbolic',
	Clipboard: 'clipboard-symbolic',
	ClipboardDisabled: 'clipboard-disabled-symbolic',
	Code: 'folder-code-legacy-symbolic',
	Color: 'color-symbolic',
	Duration: 'duration-symbolic',
	File: 'file-symbolic',
	Folder: 'folder-symbolic',
	Image: 'image-symbolic',
	Incognito: 'incognito-symbolic',
	IncognitoDisabled: 'incognito-disabled-symbolic',
	Keyboard: 'keyboard-symbolic',
	Link: 'link-symbolic',
	Pin: 'pin-symbolic',
	SearchClipboard: 'search-clipboard-symbolic',
	Settings: 'settings-symbolic',
	Tag: 'tag-symbolic',
	Text: 'text-symbolic',

	// System Icons
	Action: 'media-playback-start-symbolic',
	Add: 'list-add-symbolic',
	Check: 'object-select-symbolic',
	Delete: 'user-trash-symbolic',
	Down: 'pan-down-symbolic',
	DragHandle: 'list-drag-handle-symbolic',
	Edit: 'document-edit-symbolic',
	Help: 'help-about-symbolic',
	Hide: 'view-conceal-symbolic',
	Left: 'pan-start-symbolic',
	MissingImage: 'image-missing-symbolic',
	Next: 'go-next-symbolic',
	Right: 'pan-end-symbolic',
	Search: 'system-search-symbolic',
	Show: 'view-reveal-symbolic',
	Undo: 'edit-undo-symbolic',
	ViewList: 'view-list-symbolic',
	ViewMore: 'view-more-symbolic',
	Volume: 'audio-volume-high-symbolic',
	Warning: 'dialog-warning-symbolic',
};

export type Icon = (typeof Icon)[keyof typeof Icon];

export function loadIcon(ext: Extension, icon: Icon): Gio.Icon {
	const file = Gio.file_new_for_path(`${ext.path}/icons/hicolor/scalable/actions/${icon}.svg`);
	if (file.query_exists(null)) {
		return Gio.Icon.new_for_string(file.get_path()!);
	} else {
		return Gio.Icon.new_for_string(icon);
	}
}
