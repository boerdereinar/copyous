import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { ClipboardEntry } from '../../misc/db.js';
import { ContentInfo, createFileInfo } from '../components/contentInfo.js';
import { BackgroundSize, FileType, ImagePreview } from '../components/contentPreview.js';
import { SearchQuery } from '../searchEntry.js';
import { ClipboardItem } from './clipboardItem.js';

@registerClass({
	Properties: {
		'show-image-info': GObject.ParamSpec.boolean(
			'show-image-info',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			false,
		),
	},
})
export class ImageItem extends ClipboardItem {
	private readonly imageItemSettings: Gio.Settings;

	private _showImageInfo: boolean = false;

	private readonly _imagePreview: ImagePreview;
	private _imageInfo?: ContentInfo;

	private readonly _cancellable: Gio.Cancellable = new Gio.Cancellable();

	constructor(ext: CopyousExtension, entry: ClipboardEntry) {
		super(ext, entry, Icon.Image, _('Image'));

		this.imageItemSettings = this.ext.settings.get_child('image-item');

		this.add_style_class_name('image-item');
		this.add_style_class_name('no-image-info');

		const file = Gio.File.new_for_uri(entry.content);
		this._imagePreview = new ImagePreview(ext, file);
		this._content.add_child(this._imagePreview);

		// Bind properties
		this.imageItemSettings.connectObject(
			'changed::show-image-info',
			this.updateSettings.bind(this),
			'changed::background-size',
			this.updateSettings.bind(this),
			this,
		);

		this.updateSettings();

		// Hover effect
		this.bind_property('active', this._imagePreview, 'active', GObject.BindingFlags.DEFAULT);
	}

	get showImageInfo() {
		return this._showImageInfo;
	}

	set showImageInfo(showImageInfo: boolean) {
		if (this._showImageInfo === showImageInfo) return;

		this._showImageInfo = showImageInfo;
		this.notify('show-image-info');
		this.configureImageInfo();
	}

	override search(query: SearchQuery): void {
		this.visible = query.matchesEntry(this.visible, this.entry);
	}

	private updateSettings() {
		this.showImageInfo = this.imageItemSettings.get_boolean('show-image-info');
		this._imagePreview.backgroundSize = this.imageItemSettings.get_enum('background-size') as BackgroundSize;
	}

	private configureImageInfo() {
		if (this._imageInfo === undefined && this.showImageInfo) {
			createFileInfo(this.ext, Gio.File.new_for_uri(this.entry.content), FileType.Image, this._cancellable)
				.then((imageInfo) => {
					this._imageInfo = imageInfo;
					this._content.add_child(this._imageInfo);
					this.configureImageInfo();
				})
				.catch(() => {});
		}

		if (this._imageInfo == null) {
			return;
		}

		this._imageInfo.visible = this.showImageInfo;
		if (this.showImageInfo) {
			this.remove_style_class_name('no-image-info');
		} else {
			this.add_style_class_name('no-image-info');
		}
	}

	override destroy() {
		this.imageItemSettings.disconnectObject(this);
		this._cancellable.cancel();

		super.destroy();
	}
}
