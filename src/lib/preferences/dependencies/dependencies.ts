import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Soup from 'gi://Soup?version=3.0';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
	HljsSha512,
	HljsUrls,
	UserAgent,
	getDataPath,
	getHljsLanguageUrls,
	getHljsPath,
} from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';

export async function checkGda(prefs: ExtensionPreferences): Promise<boolean> {
	try {
		const Gda = (await import('gi://Gda')).default;

		// Check if SQLite provider is installed
		Gda.Config.get_provider('SQLite');

		return true;
	} catch (err) {
		prefs.getLogger().error((err as Error).message);
		return false;
	}
}

async function checkGSound(): Promise<boolean> {
	try {
		await import('gi://GSound');
		return true;
	} catch {
		return false;
	}
}

async function checkHighlightJS(prefs: ExtensionPreferences): Promise<boolean> {
	try {
		await import(getHljsPath(prefs).get_uri());
		return true;
	} catch (error) {
		return false;
	}
}

@registerClass()
class GuideDialog extends Adw.Dialog {
	constructor(
		title: string,
		subtitle: string,
		guideTitle: string,
		fedora: string,
		arch: string,
		ubuntu: string,
		opensuse: string,
	) {
		super();

		const toolbarView = new Adw.ToolbarView({
			extend_content_to_top_edge: true,
		});
		toolbarView.add_top_bar(new Adw.HeaderBar());
		this.set_child(toolbarView);

		const content = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			margin_top: 36,
			margin_bottom: 24,
			margin_start: 24,
			margin_end: 24,
			spacing: 24,
		});

		toolbarView.content = new Gtk.ScrolledWindow({
			propagate_natural_height: true,
			propagate_natural_width: true,
			hscrollbar_policy: Gtk.PolicyType.NEVER,
			child: content,
		});

		// Title
		content.append(
			new Gtk.Label({
				label: title,
				css_classes: ['title-2'],
			}),
		);

		// Subtitle
		content.append(
			new Gtk.Label({
				label: subtitle,
				xalign: 0,
				max_width_chars: 0,
				wrap: true,
				css_classes: ['dim-label'],
			}),
		);

		// Install guide
		const installGuide = new Adw.PreferencesGroup({
			title: guideTitle,
		});
		content.append(installGuide);
		installGuide.add(
			new Adw.ActionRow({
				title: 'Fedora',
				subtitle: `sudo dnf install ${fedora}`,
				subtitle_selectable: true,
				css_classes: ['property'],
			}),
		);
		installGuide.add(
			new Adw.ActionRow({
				title: 'Arch Linux',
				subtitle: `sudo pacman -S ${arch}`,
				subtitle_selectable: true,
				css_classes: ['property'],
			}),
		);
		installGuide.add(
			new Adw.ActionRow({
				title: 'Ubuntu/Debian',
				subtitle: `sudo apt install ${ubuntu}`,
				subtitle_selectable: true,
				css_classes: ['property'],
			}),
		);
		installGuide.add(
			new Adw.ActionRow({
				title: 'OpenSUSE',
				subtitle: `sudo zypper install ${opensuse}`,
				subtitle_selectable: true,
				css_classes: ['property'],
			}),
		);
	}
}

@registerClass()
export class GdaDialog extends GuideDialog {
	constructor() {
		super(
			_('Libgda Not Installed'),
			_(
				'Libgda is required to store clipboard history between sessions. ' +
					'Install either libgda 5.0 or 6.0 with SQLite support to use this feature. ' +
					'After installing libgda you will need to log out or restart your system.',
			),
			_('Install Libgda'),
			'libgda libgda-sqlite',
			'libgda6',
			'gir1.2-gda-5.0',
			'libgda-6_0-sqlite typelib-1_0-Gda-6_0',
		);
	}
}

@registerClass()
class HljsDialog extends Adw.AlertDialog {
	constructor(prefs: ExtensionPreferences) {
		super({
			heading: _('Highlight.js Not Installed'),
			body: _('Highlight.js is required to display syntax highlighted code.'),
		});

		const expander = new Gtk.Expander({
			label: _('Manual Installation'),
		});
		this.extra_child = expander;

		const box = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			margin_top: 8,
			spacing: 12,
		});
		expander.child = box;

		box.append(
			new Gtk.Label({
				label: _(
					'You can manually install highlight.js by downloading highlight.min.js from "Url" to "Install Location".',
				),
				wrap: true,
				halign: Gtk.Align.FILL,
				xalign: 0,
			}),
		);

		const list = new Gtk.ListBox({
			css_classes: ['boxed-list'],
			selection_mode: Gtk.SelectionMode.NONE,
		});
		box.append(list);

		list.append(
			new Adw.ActionRow({
				css_classes: ['property'],
				title: _('Url'),
				subtitle: HljsUrls[0]!,
				subtitle_selectable: true,
				activatable: false,
			}),
		);
		list.append(
			new Adw.ActionRow({
				css_classes: ['property'],
				title: _('Install Location'),
				subtitle: getDataPath(prefs).get_path() ?? '',
				subtitle_selectable: true,
				activatable: false,
			}),
		);

		this.add_response('cancel', _('Cancel'));
		this.set_close_response('cancel');
		this.add_response('install', _('Install'));
		this.set_response_appearance('install', Adw.ResponseAppearance.SUGGESTED);
	}
}

Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

async function downloadHljsModule(
	prefs: ExtensionPreferences,
	url: string,
	hash: string,
	path: Gio.File,
	cancellable: Gio.Cancellable,
): Promise<boolean> {
	try {
		if (path.query_exists(null)) {
			prefs.getLogger().error(`Highlight.js module ${path.get_path()} already installed`);
			return false;
		}

		// Check if URL is valid
		const uri = GLib.uri_parse(url, GLib.UriFlags.NONE);

		// Download page
		const session = new Soup.Session({ user_agent: UserAgent, idle_timeout: 5 });
		const message = Soup.Message.new_from_uri('GET', uri);

		// Send request
		const response = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
		if (response == null) return false;

		const data = response.get_data();
		if (data == null) return false;

		// Check integrity
		const sha512 = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA512, data);
		if (sha512 !== hash) {
			prefs
				.getLogger()
				.error(
					`Highlight.js module ${path.get_path()} integrity check failed\nExpected: ${hash}\nActual: ${sha512}`,
				);
			return false;
		}

		// Write to file
		const parent = path.get_parent()!;
		if (!parent.query_exists(cancellable)) parent.make_directory_with_parents(cancellable);

		await path.replace_contents_async(data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, cancellable);
		return true;
	} catch (error) {
		prefs.getLogger().error(error);
		return false;
	}
}

async function downloadHljs(prefs: ExtensionPreferences, cancellable: Gio.Cancellable): Promise<boolean> {
	const path = getHljsPath(prefs);
	let prefUrl = null;
	for (const url of HljsUrls) {
		if (prefUrl) prefs.getLogger().warn(`Failed to download highlight.js from '${prefUrl}'. Trying next cdn`);
		prefUrl = url;

		// eslint-disable-next-line no-await-in-loop
		if (await downloadHljsModule(prefs, url, HljsSha512, path, cancellable)) {
			return true;
		}
	}

	prefs.getLogger().error(`Failed to download highlight.js from '${prefUrl}'`);
	return false;
}

export async function downloadHljsLanguage(
	prefs: ExtensionPreferences,
	language: string,
	hash: string,
	path: Gio.File,
	cancellable: Gio.Cancellable,
) {
	let prefUrl = null;
	for (const url of getHljsLanguageUrls(language)) {
		if (prefUrl)
			prefs
				.getLogger()
				.warn(`Failed to download highlight.js language '${language}' from '${prefUrl}'. Trying next cdn`);
		prefUrl = url;

		// eslint-disable-next-line no-await-in-loop
		if (await downloadHljsModule(prefs, url, hash, path, cancellable)) {
			return true;
		}
	}

	prefs.getLogger().error(`Failed to download highlight.js language '${language}' from '${prefUrl}'`);
	return false;
}

@registerClass({
	Properties: {
		libgda: GObject.ParamSpec.boolean('libgda', null, null, GObject.ParamFlags.READABLE, false),
		gsound: GObject.ParamSpec.boolean('gsound', null, null, GObject.ParamFlags.READABLE, false),
		hljs: GObject.ParamSpec.boolean('hljs', null, null, GObject.ParamFlags.READABLE, false),
	},
	Signals: {
		'hljs-installed': {},
	},
})
export class DependenciesWarningButton extends Gtk.MenuButton {
	private _libgda: boolean = false;
	private _gsound: boolean = false;
	private _hljs: boolean = false;

	private readonly _menu: Gio.Menu;
	private _items: string[] = ['libgda', 'gsound', 'hljs'];

	private readonly _cancellable: Gio.Cancellable = new Gio.Cancellable();

	constructor(prefs: ExtensionPreferences, window: Adw.PreferencesWindow) {
		super({
			icon_name: Icon.Warning,
			css_classes: ['flat'],
		});

		const gdaDialog = new GdaDialog();

		const gsoundDialog = new GuideDialog(
			_('GSound Not Installed'),
			_(
				'GSound is required to play sound effects. Install GSound to use this feature. ' +
					'After installing GSound you will need to log out or restart your system.',
			),
			_('Install GSound'),
			'gsound',
			'gsound',
			'gir1.2-gsound-1.0',
			'typelib-1_0-GSound-1_0',
		);

		const hljsDialog = new HljsDialog(prefs);
		hljsDialog.connect('response', async (_dialog, response) => {
			if (response === 'install') {
				hljsAction.enabled = false;

				// Show start download toast
				const toast = new Adw.Toast({ title: _('Starting Highlight.js Download') });
				window.add_toast(toast);

				// Show spinner
				const spinner = new Gtk.Image();
				spinner.paintable = new Adw.SpinnerPaintable({ widget: spinner });
				this.child = spinner;
				this.remove_css_class('warning');

				// Start download
				const success = await downloadHljs(prefs, this._cancellable);

				// Hide spinner
				this.set_child(null);
				this.add_css_class('warning');

				// Show end download toast
				toast.dismiss();
				window.add_toast(
					new Adw.Toast({
						title: success ? _('Successfully Installed Highlight.js') : _('Error Installing Highlight.js'),
					}),
				);

				if (success) {
					this._hljs = await checkHighlightJS(prefs);
					if (this._hljs) {
						this.deleteItem('hljs');

						// Re-enable hljs dialog for if hljs was uninstalled for some reason
						const settings = prefs.getSettings();
						settings.set_boolean('disable-hljs-dialog', false);
					}
					this.notify('hljs');
					this.emit('hljs-installed');
				} else {
					// Re-enable action in menu if download failed
					hljsAction.enabled = true;
				}
			} else if (response === 'cancel') {
				// Disable hljs dialog from showing up since hljs is not installed
				const settings = prefs.getSettings();
				settings.set_boolean('disable-hljs-dialog', true);
			}
		});

		// Cancel operations on destroy
		this.connect('destroy', () => this._cancellable.cancel());

		// Menu
		const actionGroup = new Gio.SimpleActionGroup();

		const libgdaAction = Gio.SimpleAction.new('libgda', null);
		libgdaAction.connect('activate', () => gdaDialog.present(window));
		actionGroup.add_action(libgdaAction);

		const gsoundAction = Gio.SimpleAction.new('gsound', null);
		gsoundAction.connect('activate', () => gsoundDialog.present(window));
		actionGroup.add_action(gsoundAction);

		const hljsAction = Gio.SimpleAction.new('hljs', null);
		hljsAction.connect('activate', () => hljsDialog.present(window));
		actionGroup.add_action(hljsAction);

		this.insert_action_group('dependencies', actionGroup);

		this._menu = new Gio.Menu();
		this._menu.append(_('Libgda Not Installed'), 'dependencies.libgda');
		this._menu.append(_('GSound Not Installed'), 'dependencies.gsound');
		this._menu.append(_('Highlight.js Not Installed'), 'dependencies.hljs');
		this.menu_model = this._menu;

		// Checks
		checkGda(prefs)
			.then((libgda) => {
				this._libgda = libgda;
				if (libgda) this.deleteItem('libgda');
				this.notify('libgda');
			})
			.catch(() => prefs.getLogger().warn('Libgda check failed'));

		checkGSound()
			.then((gsound) => {
				this._gsound = gsound;
				if (gsound) this.deleteItem('gsound');
				this.notify('gsound');
			})
			.catch(() => prefs.getLogger().warn('GSound check failed'));

		checkHighlightJS(prefs)
			.then((hljs) => {
				this._hljs = hljs;
				if (hljs) {
					this.deleteItem('hljs');
				} else {
					// Open dialog for the first time if hljs is not installed
					const settings = prefs.getSettings();
					if (!settings.get_boolean('disable-hljs-dialog')) {
						hljsDialog.present(window);
					}
				}

				this.notify('hljs');
			})
			.catch(() => prefs.getLogger().warn('Highlight.js check failed'));
	}

	get libgda(): boolean {
		return this._libgda;
	}

	get gsound(): boolean {
		return this._gsound;
	}

	get hljs(): boolean {
		return this._hljs;
	}

	private deleteItem(item: string) {
		const index = this._items.indexOf(item);
		if (index < 0) return;

		this._items.splice(index, 1);
		this._menu.remove(index);
		if (this._items.length === 0) {
			this.visible = false;
		}
	}
}
