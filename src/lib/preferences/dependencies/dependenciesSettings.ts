import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import type { HLJSApi } from 'highlight.js';

import { getHljsLanguages, getHljsPath } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { downloadHljsLanguage } from './dependencies.js';

@registerClass({
	Properties: {
		'language-name': GObject.ParamSpec.string('language-name', null, null, GObject.ParamFlags.READABLE, ''),
		'language': GObject.ParamSpec.string('language', null, null, GObject.ParamFlags.READABLE, ''),
		'hash': GObject.ParamSpec.string('hash', null, null, GObject.ParamFlags.READABLE, ''),
		'file': GObject.ParamSpec.object('file', null, null, GObject.ParamFlags.READABLE, Gio.File),
		'is-default': GObject.ParamSpec.boolean('is-default', null, null, GObject.ParamFlags.READABLE, false),
		'installed': GObject.ParamSpec.boolean('installed', null, null, GObject.ParamFlags.READABLE, false),
	},
})
class Language extends GObject.Object {
	private _installed: boolean;

	constructor(
		public readonly languageName: string,
		public readonly language: string,
		public readonly hash: string,
		public readonly file: Gio.File,
		public readonly isDefault: boolean,
	) {
		super();

		this._installed = file.query_exists(null);
	}

	get installed() {
		return this._installed;
	}

	public checkInstalled() {
		const installed = this.file.query_exists(null);
		if (installed === this._installed) return installed;

		this._installed = installed;
		this.notify('installed');

		return installed;
	}
}

@registerClass({
	Properties: {
		search: GObject.ParamSpec.string('search', null, null, GObject.ParamFlags.READWRITE, ''),
		installed: GObject.ParamSpec.boolean('installed', null, null, GObject.ParamFlags.READWRITE, false),
	},
})
class LanguageFilter extends Gtk.Filter {
	private _search: string = '';
	private _installed: boolean = false;

	constructor() {
		super();
	}

	get search() {
		return this._search;
	}

	set search(search: string) {
		search = search.toLocaleLowerCase();
		if (search === this.search) return;

		let change: Gtk.FilterChange;
		if (search === '') {
			change = Gtk.FilterChange.LESS_STRICT;
		} else if (this.search === '') {
			change = Gtk.FilterChange.MORE_STRICT;
		} else if (search.includes(this.search)) {
			change = Gtk.FilterChange.MORE_STRICT;
		} else if (this.search.includes(search)) {
			change = Gtk.FilterChange.LESS_STRICT;
		} else {
			change = Gtk.FilterChange.DIFFERENT;
		}

		this._search = search;

		this.changed(change);
		this.notify('search');
	}

	get installed() {
		return this._installed;
	}

	set installed(installed: boolean) {
		if (installed === this.installed) return;

		this._installed = installed;

		const change = installed ? Gtk.FilterChange.MORE_STRICT : Gtk.FilterChange.LESS_STRICT;
		this.changed(change);
		this.notify('installed');
	}

	override vfunc_get_strictness(): Gtk.FilterMatch {
		return this.search !== '' || this.installed ? Gtk.FilterMatch.SOME : Gtk.FilterMatch.ALL;
	}

	override vfunc_match(item?: GObject.Object | null): boolean {
		if (!(item instanceof Language)) return false;

		if (this.installed && !(item.installed || item.isDefault)) return false;

		const name = item.languageName.toLocaleLowerCase();
		if (name.includes(this.search)) return true;

		const language = item.language.toLocaleLowerCase();
		return language.includes(this.search);
	}
}

Gio._promisify(Gio.File.prototype, 'delete_async');

@registerClass({
	Properties: {
		installed: GObject.ParamSpec.boolean('installed', null, null, GObject.ParamFlags.READABLE, false),
	},
	Signals: {
		changed: {},
	},
})
class LanguageWidget extends Gtk.ListBox {
	private _busy: boolean = false;

	private readonly _check: Gtk.Image;
	private readonly _delete: Gtk.Image;
	private readonly _spinner: Adw.Spinner;

	private _cancellable: Map<string, Gio.Cancellable> = new Map();

	constructor(
		private prefs: ExtensionPreferences,
		private language: Language,
		private window: Adw.PreferencesWindow,
	) {
		super({
			selection_mode: Gtk.SelectionMode.NONE,
			css_classes: ['boxed-list'],
		});

		this.language.connect('notify', this.updateVisibility.bind(this));

		const row = new Adw.ActionRow({
			title: language.language,
			activatable: !language.isDefault,
		});
		row.connect('activated', this.onActivate.bind(this));
		this.append(row);

		this._check = new Gtk.Image({
			css_classes: [language.isDefault ? 'blue' : 'success'],
			icon_name: language.isDefault ? Icon.CheckOutline : Icon.Check,
			visible: false,
		});
		row.add_suffix(this._check);

		this._delete = new Gtk.Image({
			css_classes: ['error'],
			icon_name: Icon.Delete,
			visible: false,
		});
		row.add_suffix(this._delete);

		this._spinner = new Adw.Spinner({ visible: false });
		row.add_suffix(this._spinner);

		this.updateVisibility();

		// Cancel connections
		this.connect('destroy', () => this._cancellable.forEach((c) => c.cancel()));
	}

	override vfunc_state_flags_changed(previous_state_flags: Gtk.StateFlags) {
		super.vfunc_state_flags_changed(previous_state_flags);

		this.updateVisibility();
	}

	private updateVisibility() {
		if (this._busy) {
			this._check.visible = false;
			this._delete.visible = false;
			this._spinner.visible = true;
			return;
		}

		this._check.visible = this.language.installed || this.language.isDefault;
		this._spinner.visible = false;

		if (!this.language.installed) return;

		const stateFlags = this.get_state_flags();
		const active = (stateFlags & (Gtk.StateFlags.ACTIVE | Gtk.StateFlags.PRELIGHT | Gtk.StateFlags.FOCUSED)) > 0;

		this._check.visible = !active;
		this._delete.visible = active;
	}

	private async onActivate() {
		if (this.language.isDefault || this._busy) return;

		this._busy = true;
		this.updateVisibility();

		if (!this.language.installed) {
			// Install
			const cancellable = new Gio.Cancellable();
			this._cancellable.set(this.language.languageName, cancellable);
			const success = await downloadHljsLanguage(
				this.prefs,
				this.language.languageName,
				this.language.hash,
				this.language.file,
				cancellable,
			);
			this._cancellable.delete(this.language.languageName);

			const installed = success ? this.language.checkInstalled() : false;
			if (installed) this.emit('changed');

			this.window.add_toast(
				new Adw.Toast({
					title: installed
						? _('Successfully Installed %s').format(this.language.language)
						: _('Error Installing %s').format(this.language.language),
					priority: Adw.ToastPriority.HIGH,
				}),
			);
		} else {
			// Uninstall
			let success = false;
			try {
				await this.language.file.delete_async(GLib.PRIORITY_DEFAULT, null);
				success = true;
			} catch (err) {
				console.error(err);
			}

			const uninstalled = success ? !this.language.checkInstalled() : false;
			if (uninstalled) this.emit('changed');

			this.window.add_toast(
				new Adw.Toast({
					title: uninstalled
						? _('Successfully Uninstalled %s').format(this.language.language)
						: _('Error Uninstalling %s').format(this.language.language),
					priority: Adw.ToastPriority.HIGH,
				}),
			);
		}

		this._busy = false;
		this.updateVisibility();
	}
}

@registerClass({
	Properties: {
		hljs: GObject.ParamSpec.boolean('hljs', null, null, GObject.ParamFlags.WRITABLE, false),
	},
})
class HighlightJsPage extends Adw.NavigationPage {
	private readonly _page: Adw.PreferencesPage;
	private readonly _list: Gtk.FlowBox;
	private readonly _filter: LanguageFilter;

	constructor(
		private prefs: ExtensionPreferences,
		private window: Adw.PreferencesWindow,
	) {
		super({
			title: _('Manage Highlight.js'),
		});

		const toolbarView = new Adw.ToolbarView();
		toolbarView.add_top_bar(new Adw.HeaderBar());
		this.child = toolbarView;

		// Content
		this._page = new Adw.PreferencesPage();
		toolbarView.content = this._page;

		const languagesGroup = new Adw.PreferencesGroup({
			title: _('Languages'),
		});
		this._page.add(languagesGroup);

		this._list = new Gtk.FlowBox({
			css_classes: ['hljs-languages'],
			selection_mode: Gtk.SelectionMode.NONE,
			homogeneous: true,
			max_children_per_line: 2,
			column_spacing: 6,
			row_spacing: 6,
		});
		languagesGroup.add(this._list);

		this._filter = new LanguageFilter();

		// Search
		const suffix = new Gtk.Box({ spacing: 6 });
		languagesGroup.set_header_suffix(suffix);

		const searchEntry = new Gtk.SearchEntry({
			placeholder_text: _('Search'),
		});
		searchEntry.bind_property('text', this._filter, 'search', GObject.BindingFlags.DEFAULT);
		suffix.append(searchEntry);

		const installed = new Gtk.ToggleButton({ icon_name: Icon.CheckOutline });
		installed.bind_property('active', this._filter, 'installed', GObject.BindingFlags.DEFAULT);
		suffix.append(installed);
	}

	set hljs(hljs: boolean) {
		if (hljs) this.initLanguages().catch(() => {});
	}

	private async initLanguages() {
		let defaultLanguages: string[] = [];
		try {
			const hljs = (await import(getHljsPath(this.prefs).get_uri())) as { default: HLJSApi };
			defaultLanguages = hljs.default.listLanguages();
		} catch {
			// Ignore
		}

		const listModel = Gio.ListStore.new(Language.$gtype);
		for (const [name, language, hash, file, system] of getHljsLanguages(this.prefs)) {
			const isDefault = defaultLanguages.includes(name) || system;
			listModel.append(new Language(name, language, hash, file, isDefault));
		}
		listModel.sort((a: Language, b: Language) => a.language.localeCompare(b.language));

		const filterListModel = new Gtk.FilterListModel<Language>({ model: listModel, filter: this._filter });

		this._list.bind_model(filterListModel, (language) => {
			const widget = new LanguageWidget(this.prefs, language, this.window);
			return new Gtk.FlowBoxChild({ child: widget, focusable: false });
		});
	}
}

@registerClass({
	Properties: {
		hljs: GObject.ParamSpec.boolean('hljs', null, null, GObject.ParamFlags.READWRITE, false),
	},
})
export class DependenciesSettings extends Adw.PreferencesGroup {
	declare hljs: boolean;

	private readonly _highlightJsPage: HighlightJsPage;

	constructor(
		prefs: ExtensionPreferences,
		private window: Adw.PreferencesWindow,
	) {
		super({
			title: _('Dependencies'),
		});

		this._highlightJsPage = new HighlightJsPage(prefs, window);
		this.bind_property('hljs', this._highlightJsPage, 'hljs', GObject.BindingFlags.DEFAULT);

		const manageHighlightJs = new Adw.ActionRow({
			title: _('Manage Highlight.js'),
			subtitle: _('Manage the Highlight.js installation'),
			activatable: true,
		});
		this.bind_property('hljs', manageHighlightJs, 'sensitive', GObject.BindingFlags.DEFAULT);
		manageHighlightJs.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));
		this.add(manageHighlightJs);

		manageHighlightJs.connect('activated', () => window.push_subpage(this._highlightJsPage));
	}

	openHighlightJsPage() {
		this.window.push_subpage(this._highlightJsPage);
	}
}
