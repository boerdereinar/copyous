import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import type CopyousExtension from '../../extension.js';
import { ItemType } from '../common/constants.js';
import { registerClass } from '../common/gjs.js';
import { Icon, loadIcon } from '../common/icons.js';
import { ClipboardEntry } from '../database/database.js';
import { normalizeIndentation, trim } from '../ui/components/label.js';
import { commonDirectory } from '../ui/items/filesItem.js';

@registerClass()
export class NotificationManager extends GObject.Object {
	private _source: MessageTray.Source | null = null;

	constructor(private ext: CopyousExtension) {
		super();
	}

	private get source() {
		if (this._source) return this._source;

		this._source = new MessageTray.Source({
			title: this.ext.metadata.name,
			icon: loadIcon(this.ext, Icon.Clipboard),
		});

		this._source.connect('destroy', () => (this._source = null));
		Main.messageTray.add(this._source);
		return this._source;
	}

	public warning(title: string, body: string, ...actions: [label: string, callback: () => void][]) {
		const source = this.source;
		const notification = new MessageTray.Notification({
			source,
			title,
			body,
			gicon: loadIcon(this.ext, Icon.Warning),
		});

		for (const [label, callback] of actions) {
			notification.addAction(label, callback);
		}

		source.addNotification(notification);
	}

	public textNotification(text: string) {
		if (!this.ext.settings.get_boolean('send-notification')) return;

		const source = this.source;
		const notification = new MessageTray.Notification({
			source,
			title: _('Copied Text'),
			body: text,
			gicon: loadIcon(this.ext, Icon.Text),
			isTransient: true,
		});
		source.addNotification(notification);
	}

	private createImageContent(pixbuf: GdkPixbuf.Pixbuf): St.ImageContent {
		const context = global.stage.context.get_backend().get_cogl_context();
		const pixels = pixbuf.get_pixels();
		const content = new St.ImageContent({
			preferred_width: pixbuf.width,
			preferred_height: pixbuf.height,
		});
		content.set_bytes(context, pixels, Cogl.PixelFormat.RGBA_8888, pixbuf.width, pixbuf.height, pixbuf.rowstride);
		return content;
	}

	public imageNotification(bytes: GLib.Bytes | Uint8Array, width: number, height: number) {
		if (!this.ext.settings.get_boolean('send-notification')) return;

		let gicon: Gio.Icon | St.ImageContent;
		try {
			const stream = Gio.MemoryInputStream.new_from_bytes(bytes);
			const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_at_scale(stream, 256, 256, true, null);
			gicon = this.createImageContent(pixbuf);
		} catch (error) {
			this.ext.logger.error(error);
			return;
		}

		const source = this.source;
		const notification = new MessageTray.Notification({
			source,
			title: _('Copied Image'),
			body: _('Size: %d×%d px').format(width, height),
			gicon,
			isTransient: true,
		});
		source.addNotification(notification);
	}

	public notification(entry: ClipboardEntry) {
		if (!this.ext.settings.get_boolean('send-notification')) return;

		let title: string;
		let body: string | null = normalizeIndentation(trim(entry.content), 4);
		let gicon: Gio.Icon | St.ImageContent;
		switch (entry.type) {
			case ItemType.Text:
				title = _('Copied Text');
				gicon = loadIcon(this.ext, Icon.Text);
				break;
			case ItemType.Code:
				title = _('Copied Code');
				gicon = loadIcon(this.ext, Icon.Code);
				break;
			case ItemType.Image: {
				const file = body.substring('file://'.length);
				title = _('Copied Image');

				try {
					const [, width, height] = GdkPixbuf.Pixbuf.get_file_info(file);
					const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(file, 256, 256, true);
					gicon = this.createImageContent(pixbuf);
					body = _('Size: %d×%d px').format(width, height);
				} catch (error) {
					this.ext.logger.error(error);
					return;
				}

				break;
			}
			case ItemType.File:
			case ItemType.Files: {
				const files = body.split('\n').map((f) => Gio.file_new_for_uri(f));
				const common = files.length === 1 ? files[0]! : commonDirectory(files);

				title = ngettext('Copied %d File', 'Copied %d Files', files.length).format(files.length);
				body = common.get_path() ?? '';
				gicon = loadIcon(this.ext, files.length === 1 ? Icon.File : Icon.Folder);
				break;
			}
			case ItemType.Link:
				title = _('Copied Link');
				gicon = loadIcon(this.ext, Icon.Link);
				break;
			case ItemType.Character:
				title = _('Copied Character');
				gicon = loadIcon(this.ext, Icon.Character);
				break;
			case ItemType.Color:
				title = _('Copied Color');
				gicon = loadIcon(this.ext, Icon.Color);
				break;
		}

		const source = this.source;
		const notification = new MessageTray.Notification({ source, title, body, gicon, isTransient: true });
		source.addNotification(notification);
	}
}
