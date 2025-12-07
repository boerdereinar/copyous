import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';

Gio._promisify(Adw.AlertDialog.prototype, 'choose');

@registerClass({
	Signals: {
		activate: {
			param_types: [Gio.AppInfo.$gtype],
		},
	},
})
class AppSelectionPopover extends Gtk.Popover {
	private readonly _searchEntry: Gtk.SearchEntry;
	private readonly _scrollWindow: Gtk.ScrolledWindow;

	constructor() {
		super({
			css_classes: ['app-selection-popover'],
		});

		const box = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
		});
		this.child = box;

		this._searchEntry = new Gtk.SearchEntry({
			placeholder_text: _('Search apps'),
			margin_top: 6,
			margin_bottom: 6,
			margin_start: 6,
			margin_end: 6,
		});
		box.append(this._searchEntry);

		const separator = new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL });
		box.append(separator);

		const stack = new Gtk.Stack();
		box.append(stack);

		this._scrollWindow = new Gtk.ScrolledWindow({
			height_request: 300,
			width_request: 300,
			hscrollbar_policy: Gtk.PolicyType.NEVER,
			vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
			focusable: false,
		});
		stack.add_named(this._scrollWindow, 'list');

		const list = new Gtk.ListBox({
			css_classes: ['listview'],
			selection_mode: Gtk.SelectionMode.NONE,
			valign: Gtk.Align.START,
			margin_top: 6,
			margin_bottom: 6,
			margin_start: 6,
			margin_end: 6,
		});
		this._scrollWindow.child = list;

		const placeholder = new Adw.StatusPage({
			title: _('No Apps Found'),
			icon_name: Icon.Search,
			css_classes: ['compact', 'dim-label'],
			height_request: 300,
		});
		stack.add_named(placeholder, 'placeholder');

		// Bind model
		const model = new Gio.ListStore({ item_type: Gio.AppInfo.$gtype });
		const apps = Gio.AppInfo.get_all()
			.filter((info) => info.should_show() && 'get_startup_wm_class' in info)
			.sort((info1, info2) => info1.get_display_name().localeCompare(info2.get_display_name()));
		model.splice(0, 0, apps);

		const filter = new Gtk.StringFilter({
			expression: Gtk.ClosureExpression.new(
				GObject.TYPE_STRING,
				(info: Gio.AppInfo) => info.get_display_name(),
				null,
			),
			ignore_case: true,
			match_mode: Gtk.StringFilterMatchMode.SUBSTRING,
		});
		this._searchEntry.connect('search-changed', () => filter.set_search(this._searchEntry.text));

		const filterModel = new Gtk.FilterListModel<GioUnix.DesktopAppInfo>({
			model,
			filter,
			incremental: true,
		});
		filterModel.connect('notify::n-items', () => {
			const n = filterModel.n_items;
			stack.set_visible_child_name(n !== 0 ? 'list' : 'placeholder');
		});

		list.connect('row-activated', (_list, row) => {
			const item = filterModel.get_item(row.get_index());
			this.emit('activate', item);
			this.hide();
		});

		list.bind_model(filterModel, (info) => {
			const row = new Gtk.ListBoxRow({
				activatable: true,
			});

			const rowBox = new Gtk.Box({
				spacing: 6,
				margin_top: 3,
				margin_bottom: 3,
				margin_start: 3,
				margin_end: 3,
			});
			row.child = rowBox;

			rowBox.append(
				new Gtk.Image({
					gicon: info.get_icon() ?? Gio.Icon.new_for_string('application-x-executable'),
					icon_size: Gtk.IconSize.LARGE,
				}),
			);

			rowBox.append(
				new Gtk.Label({
					label: info.get_display_name(),
					halign: Gtk.Align.START,
					ellipsize: Pango.EllipsizeMode.END,
				}),
			);

			return row;
		});
	}

	override vfunc_map(): void {
		super.vfunc_map();

		this._searchEntry.text = '';
		this._scrollWindow.vadjustment.value = 0;
	}
}

@registerClass({
	Properties: {
		exclusion: GObject.ParamSpec.string('exclusion', null, null, GObject.ParamFlags.READABLE, ''),
	},
})
class WMClassExclusionDialog extends Adw.AlertDialog {
	private readonly _entry: Adw.EntryRow;

	constructor() {
		super({
			heading: _('Add App Exclusion'),
			body: _('Enter the WM Class of the application you want to exclude:'),
		});

		this.add_response('cancel', _('Cancel'));
		this.set_close_response('cancel');
		this.add_response('add', _('Add'));
		this.set_response_appearance('add', Adw.ResponseAppearance.SUGGESTED);
		this.set_response_enabled('add', false);

		// Entry
		const list = new Gtk.ListBox({ css_classes: ['boxed-list'], selection_mode: Gtk.SelectionMode.NONE });
		this.extra_child = list;

		this._entry = new Adw.EntryRow({
			title: _('WM Class'),
		});
		this.focus_widget = this._entry;
		list.append(this._entry);

		const popover = new AppSelectionPopover();
		popover.connect('activate', (_popover, info: Gio.DesktopAppInfo) => {
			const wmClass = info.get_startup_wm_class() ?? info.get_id()?.replace(/.desktop$/, '');
			if (wmClass) this._entry.text = wmClass;
		});

		const appsButton = new Gtk.MenuButton({
			icon_name: Icon.ViewList,
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
			popover,
		});

		this._entry.add_suffix(appsButton);

		this._entry.connect('changed', () => {
			this.set_response_enabled('add', this.exclusion.length > 0);
		});
	}

	get exclusion(): string {
		return this._entry.text;
	}
}

@registerClass({
	Properties: {
		exclusions: GObject.ParamSpec.boxed(
			'exclusions',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			GLib.strv_get_type(),
		),
	},
})
class AppExclusionsGroup extends Adw.PreferencesGroup {
	private _listModel = new Gtk.StringList();

	constructor(window: Adw.PreferencesWindow, title: string) {
		super({ title });

		const addExclusion = new Gtk.Button({
			icon_name: Icon.Add,
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
		});
		this.header_suffix = addExclusion;

		const list = new Gtk.ListBox({ css_classes: ['boxed-list'], selection_mode: Gtk.SelectionMode.NONE });
		this.add(list);

		list.bind_model(this._listModel, (item) => {
			const row = new Adw.ActionRow({ title: item.string });

			const deleteButton = new Gtk.Button({
				icon_name: Icon.Delete,
				valign: Gtk.Align.CENTER,
				css_classes: ['flat', 'destructive-action'],
			});
			row.add_suffix(deleteButton);
			deleteButton.connect('clicked', () => {
				this._listModel.remove(row.get_index());
				this.notify('exclusions');
			});

			return row;
		});

		list.set_placeholder(
			new Adw.ActionRow({
				title: _('No Exclusions'),
				sensitive: false,
			}),
		);

		// Dialog
		addExclusion.connect('clicked', async () => {
			const addExclusionDialog = new WMClassExclusionDialog();
			const response = await addExclusionDialog.choose(window, null);
			if (response === 'add') {
				this._listModel.append(addExclusionDialog.exclusion);
				this.notify('exclusions');
			}
		});
	}

	get exclusions(): string[] {
		const strings: string[] = [];
		for (let i = 0; i < this._listModel.n_items; i++) {
			const string = this._listModel.get_string(i);
			if (string) strings.push(string);
		}
		return strings;
	}

	set exclusions(exclusions: string[]) {
		this._listModel.splice(0, this._listModel.n_items, exclusions);
		this.notify('exclusions');
	}
}

@registerClass()
export class AppExclusionsPage extends Adw.NavigationPage {
	constructor(prefs: ExtensionPreferences, window: Adw.PreferencesWindow) {
		super({
			title: _('App Exclusions'),
		});

		const toolbarView = new Adw.ToolbarView();
		toolbarView.add_top_bar(new Adw.HeaderBar());
		this.child = toolbarView;

		const page = new Adw.PreferencesPage();
		toolbarView.content = page;

		// App Exclusions
		const wmClassExclusionsGroup = new AppExclusionsGroup(window, _('App Exclusions'));
		page.add(wmClassExclusionsGroup);

		// Bind properties
		const settings = prefs.getSettings();
		settings.bind('wmclass-exclusions', wmClassExclusionsGroup, 'exclusions', Gio.SettingsBindFlags.DEFAULT);
	}
}

@registerClass()
export class AppExclusionSettings extends Adw.PreferencesGroup {
	constructor(prefs: ExtensionPreferences, window: Adw.PreferencesWindow) {
		super({
			title: _('Exclusions'),
		});

		const appExclusionsPage = new AppExclusionsPage(prefs, window);

		const manageExclusions = new Adw.ActionRow({
			title: _('Manage App Exclusions'),
			subtitle: _('Manage apps that will be excluded from clipboard history'),
			activatable: true,
		});
		manageExclusions.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));
		this.add(manageExclusions);

		manageExclusions.connect('activated', () => window.push_subpage(appExclusionsPage));
	}
}
