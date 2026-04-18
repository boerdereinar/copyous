import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../../prefs.js';
import { flagsParamSpec, registerClass } from '../../../common/gjs.js';
import { Icon } from '../../../common/icons.js';
import { bind_enum, bind_flags } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';
import { ExclusionsGroup } from './exclusions.js';

const FilePreviewType = {
	None: 0,
	Text: 0b001,
	Image: 0b010,
	Thumbnail: 0b100,
	All: 0b111,
} as const;

export type FilePreviewType = (typeof FilePreviewType)[keyof typeof FilePreviewType];

@registerClass({
	Properties: {
		'file-preview-types': flagsParamSpec(
			'file-preview-types',
			GObject.ParamFlags.READWRITE,
			FilePreviewType,
			FilePreviewType.All,
		),
		'file-preview-exclusion-patterns': GObject.ParamSpec.boxed(
			'file-preview-exclusion-patterns',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			GLib.strv_get_type(),
		),
	},
})
class FileExclusionsPage extends Adw.NavigationPage {
	private _filePreviewTypes: FilePreviewType = FilePreviewType.All;

	private readonly _textPreview: Adw.SwitchRow;
	private readonly _imagePreview: Adw.SwitchRow;
	private readonly _thumbnailPreview: Adw.SwitchRow;

	constructor(window: Adw.PreferencesWindow) {
		super({
			title: _('File Exclusions'),
		});

		const toolbarView = new Adw.ToolbarView();
		toolbarView.add_top_bar(new Adw.HeaderBar());
		this.set_child(toolbarView);

		const page = new Adw.PreferencesPage();
		toolbarView.content = page;

		// File Preview Type
		const filePreviewType = new Adw.PreferencesGroup({
			title: _('File Preview Type'),
		});
		page.add(filePreviewType);

		this._textPreview = new Adw.SwitchRow({
			title: _('Text'),
			subtitle: _('Enable file previews for all text files'),
			active: true,
		});
		this._textPreview.connect('notify::active', () =>
			this.setFilePreviewType(FilePreviewType.Text, this._textPreview.active),
		);
		filePreviewType.add(this._textPreview);

		this._imagePreview = new Adw.SwitchRow({
			title: _('Image'),
			subtitle: _('Enable file previews for all image files'),
			active: true,
		});
		this._imagePreview.connect('notify::active', () =>
			this.setFilePreviewType(FilePreviewType.Image, this._imagePreview.active),
		);
		filePreviewType.add(this._imagePreview);

		this._thumbnailPreview = new Adw.SwitchRow({
			title: _('Thumbnail'),
			subtitle: _('Enable file previews for all files with generated thumbnails'),
			active: true,
		});
		this._thumbnailPreview.connect('notify::active', () =>
			this.setFilePreviewType(FilePreviewType.Thumbnail, this._thumbnailPreview.active),
		);
		filePreviewType.add(this._thumbnailPreview);

		// File Exclusion Patterns
		const filePreviewExclusionPatternsGroup = new ExclusionsGroup(
			window,
			_('Add Pattern'),
			_('Enter a glob pattern to exclude files that should not have a preview.'),
			_('Path'),
			true,
			{
				title: _('File Exclusion Patterns'),
				description: _('Files matching these patterns will not have a preview'),
			},
		);
		page.add(filePreviewExclusionPatternsGroup);
		this.bind_property(
			'file-preview-exclusion-patterns',
			filePreviewExclusionPatternsGroup,
			'exclusion-patterns',
			GObject.BindingFlags.BIDIRECTIONAL,
		);
	}

	get filePreviewTypes() {
		return this._filePreviewTypes;
	}

	set filePreviewTypes(types: FilePreviewType) {
		if (this._filePreviewTypes === types) return;
		this._filePreviewTypes = types;
		this._textPreview.active = (types & FilePreviewType.Text) > 0;
		this._imagePreview.active = (types & FilePreviewType.Image) > 0;
		this._thumbnailPreview.active = (types & FilePreviewType.Thumbnail) > 0;

		this.notify('file-preview-types');
	}

	private setFilePreviewType(type: FilePreviewType, active: boolean) {
		if (active) {
			this.filePreviewTypes |= type;
		} else {
			this.filePreviewTypes &= ~type;
		}
	}
}

@registerClass({
	Properties: {
		hljs: GObject.ParamSpec.boolean('hljs', null, null, GObject.ParamFlags.READWRITE, false),
	},
})
export class FileItemCustomization extends Adw.ExpanderRow {
	constructor(prefs: Preferences, window: Adw.PreferencesWindow) {
		super({
			title: _('File Item'),
			subtitle: _('Configure file clipboard items'),
		});

		const filePreviewVisibility = new Adw.ComboRow({
			title: _('File Preview Visibility'),
			subtitle: _(
				'File preview shows a preview of the contents of a file.\nFile info shows some information about the file.',
			),
			model: Gtk.StringList.new([
				_('File Preview'),
				_('File Info'),
				_('File Preview or File Info'),
				_('File Preview and File Info'),
				_('Hidden'),
			]),
		});
		this.add_row(filePreviewVisibility);

		const fileExclusionsPage = new FileExclusionsPage(window);

		const backgroundSize = new Adw.ComboRow({
			title: _('Background Size'),
			subtitle: _('Background size of the image preview'),
			model: Gtk.StringList.new([_('Cover'), _('Contain')]),
		});
		this.add_row(backgroundSize);

		const syntaxHighlighting = new Adw.SwitchRow({
			title: _('Syntax Highlighting'),
			subtitle: _('Enable or disable syntax highlighting in the text preview'),
		});
		this.add_row(syntaxHighlighting);

		const showLineNumbers = new Adw.SwitchRow({
			title: _('Show Line Numbers'),
			subtitle: _('Show line numbers in the text preview'),
		});
		this.add_row(showLineNumbers);

		const configureFileExclusions = new Adw.ActionRow({
			title: _('File Exclusions'),
			subtitle: _('Configure file exclusions for file previews'),
			activatable: true,
		});
		configureFileExclusions.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));
		this.add_row(configureFileExclusions);

		configureFileExclusions.connect('activated', () => window.push_subpage(fileExclusionsPage));

		// Bind properties
		const settings = prefs.getSettings().get_child('file-item');
		bind_enum(settings, 'file-preview-visibility', filePreviewVisibility, 'selected');
		bind_flags(settings, 'file-preview-types', fileExclusionsPage, 'file-preview-types');
		settings.bind(
			'file-preview-exclusion-patterns',
			fileExclusionsPage,
			'file-preview-exclusion-patterns',
			Gio.SettingsBindFlags.DEFAULT,
		);
		bind_enum(settings, 'background-size', backgroundSize, 'selected');
		settings.bind('syntax-highlighting', syntaxHighlighting, 'active', null);
		settings.bind('show-line-numbers', showLineNumbers, 'active', null);

		makeResettable(filePreviewVisibility, settings, 'file-preview-visibility');
		makeResettable(backgroundSize, settings, 'background-size');

		this.bind_property('hljs', syntaxHighlighting, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
		this.bind_property('hljs', showLineNumbers, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
	}
}
