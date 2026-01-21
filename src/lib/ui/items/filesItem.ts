import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { ClipboardEntry } from '../../misc/db.js';
import { ContentPreview } from '../components/contentPreview.js';
import { SearchQuery } from '../searchEntry.js';
import { ClipboardItem } from './clipboardItem.js';
import { formatFile } from './fileItem.js';

export function commonDirectory(files: Gio.File[]): Gio.File {
	return files
		.map((f) => f.get_parent())
		.filter((f) => f !== null)
		.reduce((common, file) => {
			if (common.equal(file)) {
				return common;
			}

			while (!file.has_prefix(common)) {
				common = common.get_parent()!;
			}

			return common;
		});
}

@registerClass()
export class FilesPreview extends ContentPreview {
	private readonly _files: St.BoxLayout;
	private readonly _border: St.Widget;
	private readonly _moreFiles: St.Label;

	constructor(files: string[]) {
		super();

		this.add_style_class_name('files-preview');

		this._files = new St.BoxLayout({
			style_class: 'files-preview-list',
			orientation: Clutter.Orientation.VERTICAL,
			min_height: 0,
			x_expand: true,
			clip_to_allocation: true,
		});
		this.add_child(this._files);

		for (const file of files) {
			const label = new St.Label({
				style_class: 'files-preview-item',
				text: file.trim(),
			});
			label.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
			this._files.add_child(label);
		}

		this._border = new St.Widget({
			style_class: 'files-preview-border',
			x_align: Clutter.ActorAlign.FILL,
			x_expand: true,
		});
		this.add_child(this._border);

		this._moreFiles = new St.Label({
			style_class: 'more-files',
			y_expand: true,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this.add_child(this._moreFiles);
	}

	override vfunc_get_preferred_height(for_width: number): [number, number] {
		const [min] = super.vfunc_get_preferred_height(for_width);
		const nat = this._files.get_children().reduce((a, f) => a + f.get_preferred_height(-1)[1], 0);
		return [min, nat];
	}

	override vfunc_allocate(box: Clutter.ActorBox): void {
		const nat = this._files.get_children().reduce((a, f) => a + f.get_preferred_height(-1)[1], 0);
		const [, borderNat] = this._border.get_preferred_height(box.get_width());
		const [, moreNat] = this._moreFiles.get_preferred_height(box.get_width());

		const lastChildNat = this._files.last_child?.get_preferred_height(box.get_width())?.[1] ?? 0;
		const maxHeight = box.get_height();

		this._border.visible = true;
		if (nat - lastChildNat * 0.5 < maxHeight) {
			for (const file of this._files.get_children()) file.visible = true;
			this._moreFiles.visible = false;

			// Hide bottom border in the border radius area
			const radius = this.get_theme_node().get_border_radius(null);
			if (maxHeight - nat <= radius) {
				this._border.visible = false;
			}
		} else {
			let height = 0;
			let count = 0;
			for (const child of this._files.get_children()) {
				const [, childNat] = child.get_preferred_height(-1);
				if (height + childNat * 0.5 + borderNat + moreNat >= maxHeight) {
					child.visible = false;
				} else {
					child.visible = true;
					count++;
				}

				height += childNat;
			}

			// More files label
			const n = this._files.get_n_children() - count;
			this._moreFiles.text = count
				? ngettext('%d more file', '%d more files', n).format(n)
				: ngettext('%d file', '%d files', n).format(n);
			this._moreFiles.visible = true;

			// Hide bottom border if only the file count is shown
			if (!count) {
				this._border.visible = false;
			}
		}

		super.vfunc_allocate(box);
	}
}

@registerClass()
export class FilesItem extends ClipboardItem {
	private readonly _files: string[];
	private readonly _formattedFiles?: string[];

	constructor(ext: CopyousExtension, entry: ClipboardEntry) {
		super(ext, entry, Icon.Folder, _('Files'));

		this.add_style_class_name('files-item');

		const files: Gio.File[] = entry.content
			.split('\n')
			.map((f: string) => Gio.File.new_for_uri(f))
			.filter((f) => f.get_path() !== null);
		const common = commonDirectory(files);

		const filePath = new St.Label({
			style_class: 'files-item-path',
			text: formatFile(common),
		});
		filePath.clutter_text.ellipsize = Pango.EllipsizeMode.START;
		this._content.add_child(filePath);

		const relativeFiles = files.map((f) => common.get_relative_path(f)).filter((f) => f !== null);
		this._content.add_child(new FilesPreview(relativeFiles));

		this._files = files.map((f) => f.get_path()?.toLowerCase() ?? '');
		if (filePath.text.startsWith('~')) {
			this._formattedFiles = files.map((f) => formatFile(f).toLowerCase());
		}
	}

	public override search(query: SearchQuery): void {
		const searchTexts = [...this._files, ...(this._formattedFiles ?? [])];
		if (this.entry.title) searchTexts.push(this.entry.title);
		this.visible = query.matchesEntry(this.visible, this.entry, ...searchTexts);
	}
}
