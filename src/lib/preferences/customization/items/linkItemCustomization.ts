import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../../prefs.js';
import { registerClass } from '../../../common/gjs.js';
import { Icon } from '../../../common/icons.js';
import { bind_enum } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';
import { ExclusionsGroup } from './exclusions.js';

@registerClass({
	Properties: {
		'link-preview-exclusion-patterns': GObject.ParamSpec.boxed(
			'link-preview-exclusion-patterns',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			GLib.strv_get_type(),
		),
	},
})
class LinkExclusionsPage extends Adw.NavigationPage {
	constructor(window: Adw.PreferencesWindow) {
		super({
			title: _('Link Exclusions'),
		});

		const toolbarView = new Adw.ToolbarView();
		toolbarView.add_top_bar(new Adw.HeaderBar());
		this.set_child(toolbarView);

		const page = new Adw.PreferencesPage();
		toolbarView.content = page;

		// Link Exclusion Patterns
		const linkPreviewExclusionPatternsGroup = new ExclusionsGroup(
			window,
			_('Add Pattern'),
			_('Enter a regular expression to exclude links that should not have a preview.'),
			_('Link'),
			false,
			{
				title: _('Link Exclusion Patterns'),
				description: _('Links matching these patterns will not have a preview'),
			},
		);
		page.add(linkPreviewExclusionPatternsGroup);
		this.bind_property(
			'link-preview-exclusion-patterns',
			linkPreviewExclusionPatternsGroup,
			'exclusion-patterns',
			GObject.BindingFlags.BIDIRECTIONAL,
		);
	}
}

@registerClass()
export class LinkItemCustomization extends Adw.ExpanderRow {
	constructor(prefs: Preferences, window: Adw.PreferencesWindow) {
		super({
			title: _('Link Item'),
			subtitle: _('Configure link clipboard items'),
		});

		const showLinkPreview = new Adw.SwitchRow({
			title: _('Show Link Preview'),
			subtitle: _('Show link preview in the link item'),
		});
		this.add_row(showLinkPreview);

		const showLinkPreviewImage = new Adw.SwitchRow({
			title: _('Show Link Preview Image'),
			subtitle: _('Show link preview image in the link item'),
		});
		this.add_row(showLinkPreviewImage);

		const linkPreviewImageBackgroundSize = new Adw.ComboRow({
			title: _('Link Preview Image Background Size'),
			subtitle: _('Background size of the link preview image'),
			model: Gtk.StringList.new([_('Cover'), _('Contain')]),
		});
		this.add_row(linkPreviewImageBackgroundSize);

		const linkPreviewOrientation = new Adw.ComboRow({
			title: _('Link Preview Orientation'),
			subtitle: _('Orientation of the link preview'),
			model: Gtk.StringList.new([_('Horizontal'), _('Vertical')]),
		});
		this.add_row(linkPreviewOrientation);

		const linkExclusionsPage = new LinkExclusionsPage(window);

		const configureLinkExclusions = new Adw.ActionRow({
			title: _('Link Exclusions'),
			subtitle: _('Configure link exclusions for link previews'),
			activatable: true,
		});
		configureLinkExclusions.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));
		this.add_row(configureLinkExclusions);

		configureLinkExclusions.connect('activated', () => window.push_subpage(linkExclusionsPage));

		// Bind properties
		const settings = prefs.getSettings().get_child('link-item');
		settings.bind('show-link-preview', showLinkPreview, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-link-preview-image', showLinkPreviewImage, 'active', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(settings, 'link-preview-image-background-size', linkPreviewImageBackgroundSize, 'selected');
		bind_enum(settings, 'link-preview-orientation', linkPreviewOrientation, 'selected');
		settings.bind(
			'link-preview-exclusion-patterns',
			linkExclusionsPage,
			'link-preview-exclusion-patterns',
			Gio.SettingsBindFlags.DEFAULT,
		);

		makeResettable(linkPreviewImageBackgroundSize, settings, 'link-preview-image-background-size');
		makeResettable(linkPreviewOrientation, settings, 'link-preview-orientation');

		showLinkPreview.bind_property('active', showLinkPreviewImage, 'sensitive', GObject.BindingFlags.SYNC_CREATE);

		// Background size
		function updateSensitive() {
			const sensitive = showLinkPreviewImage.sensitive && showLinkPreviewImage.active;
			linkPreviewImageBackgroundSize.sensitive = sensitive;
			linkPreviewOrientation.sensitive = sensitive;
		}

		updateSensitive();
		showLinkPreviewImage.connect('notify::sensitive', () => updateSensitive());
		showLinkPreviewImage.connect('notify::active', () => updateSensitive());
	}
}
