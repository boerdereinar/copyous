import Adw from 'gi://Adw';
// DEBUG-ONLY
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { Icon } from './lib/common/icons.js';
import { ActionsPage } from './lib/preferences/actions/actionsPage.js';
import { DialogCustomization } from './lib/preferences/customization/dialogCustomization.js';
import { HeaderCustomization } from './lib/preferences/customization/headerCustomization.js';
import { ItemCustomization } from './lib/preferences/customization/itemCustomization.js';
import { ItemsCustomization } from './lib/preferences/customization/itemsCustomization.js';
import { Profiles } from './lib/preferences/customization/profiles.js';
import { ThemeCustomization } from './lib/preferences/customization/themeCustomization.js';
import { DependenciesWarningButton } from './lib/preferences/dependencies/dependencies.js';
import { DependenciesSettings } from './lib/preferences/dependencies/dependenciesSettings.js';
import { AppExclusionSettings } from './lib/preferences/general/appExclusionSettings.js';
import { BehaviorSettings } from './lib/preferences/general/behaviorSettings.js';
import { FeedbackSettings } from './lib/preferences/general/feedbackSettings.js';
import { HistorySettings } from './lib/preferences/general/historySettings.js';
import { LocationsGroup } from './lib/preferences/general/locationsGroup.js';
import { DialogShortcuts } from './lib/preferences/shortcuts/dialogShortcuts.js';
import { ItemActivationShortcuts, ItemShortcuts } from './lib/preferences/shortcuts/itemShortcuts.js';
import { NavigationShortcuts } from './lib/preferences/shortcuts/navigationShortcuts.js';
import { PopupMenuShortcuts } from './lib/preferences/shortcuts/popupMenuShortcuts.js';
import {
	SearchNavigationShortcuts,
	SearchScrollShortcuts,
	SearchShortcuts,
} from './lib/preferences/shortcuts/searchShortcuts.js';

function findHeaderBar(window: Adw.PreferencesWindow): Adw.HeaderBar | null {
	// Depth first search for the header bar
	const stack: Gtk.Widget[] = [window];
	let widget = undefined;
	while ((widget = stack.pop())) {
		if (widget instanceof Adw.HeaderBar) {
			return widget;
		} else {
			const sibling = widget.get_next_sibling();
			if (sibling) stack.push(sibling);

			const child = widget.get_first_child();
			if (child) stack.push(child);
		}
	}

	return null;
}

export default class Preferences extends ExtensionPreferences {
	override async fillPreferencesWindow(window: Adw.PreferencesWindow) {
		window.default_height = 810;

		// Enable search
		window.search_enabled = true;

		// Add dependencies button to headerbar
		const headerBar = findHeaderBar(window);
		const dependenciesButton = new DependenciesWarningButton(this, window);
		headerBar?.pack_end(dependenciesButton);

		// General page
		const general = new Adw.PreferencesPage({
			name: 'general',
			title: _('General'),
			icon_name: Icon.Settings,
		});
		window.add(general);

		const history = new HistorySettings(this, window);
		dependenciesButton.bind_property('libgda', history, 'libgda', GObject.BindingFlags.SYNC_CREATE);
		general.add(history);
		const feedback = new FeedbackSettings(this, window);
		dependenciesButton.bind_property('gsound', feedback, 'gsound', GObject.BindingFlags.SYNC_CREATE);
		general.add(feedback);
		general.add(new BehaviorSettings(this));
		general.add(new AppExclusionSettings(this, window));
		const dependenciesSettings = new DependenciesSettings(this, window);
		dependenciesButton.bind_property('hljs', dependenciesSettings, 'hljs', GObject.BindingFlags.SYNC_CREATE);
		dependenciesButton.connect('hljs-installed', () => dependenciesSettings.openHighlightJsPage());
		general.add(dependenciesSettings);
		general.add(new LocationsGroup(this, window));

		// Customization page
		const customization = new Adw.PreferencesPage({
			name: 'customization',
			title: _('Customization'),
			icon_name: Icon.Image,
		});
		window.add(customization);

		customization.add(new Profiles(this));
		customization.add(new DialogCustomization(this));
		customization.add(new ItemCustomization(this));
		customization.add(new HeaderCustomization(this));
		const items = new ItemsCustomization(this, window);
		dependenciesButton.bind_property('hljs', items, 'hljs', GObject.BindingFlags.SYNC_CREATE);
		customization.add(items);
		customization.add(new ThemeCustomization(this));

		// Shortcuts page
		const shortcuts = new Adw.PreferencesPage({
			name: 'shortcuts',
			title: _('Shortcuts'),
			icon_name: Icon.Keyboard,
		});
		window.add(shortcuts);

		shortcuts.add(new DialogShortcuts(this));
		shortcuts.add(new ItemShortcuts(this));
		shortcuts.add(new ItemActivationShortcuts());
		shortcuts.add(new PopupMenuShortcuts());
		shortcuts.add(new NavigationShortcuts());
		shortcuts.add(new SearchShortcuts());
		shortcuts.add(new SearchNavigationShortcuts());
		shortcuts.add(new SearchScrollShortcuts(this));

		// Actions page
		const actions = new ActionsPage(this, window);
		window.add(actions);

		// Register icons
		const display = Gdk.Display.get_default()!;
		const iconTheme = Gtk.IconTheme.get_for_display(display);
		iconTheme.add_search_path(`${this.dir.get_path()}/icons`);

		// Register resources
		const resource = Gio.resource_load(`${this.path}/resources.gresource`);
		Gio.resources_register(resource);

		// Register css
		const provider = new Gtk.CssProvider();
		provider.load_from_resource('/org/gnome/Shell/Extensions/copyous/style.css');
		Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

		// Unregister resources
		window.connect('destroy', () => {
			Gio.resources_unregister(resource);
			Gtk.StyleContext.remove_provider_for_display(display, provider);
		});

		return Promise.resolve();
	}

	/* DEBUG-ONLY */
	override getSettings(schema?: string): Gio.Settings {
		const environment = GLib.get_environ();
		const settings = GLib.environ_getenv(environment, 'DEBUG_COPYOUS_SCHEMA');
		if (settings) schema ??= this.metadata['settings-schema'] + '.debug';

		return super.getSettings(schema);
	}
}
