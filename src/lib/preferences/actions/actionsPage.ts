import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../prefs.js';
import { ActionConfig, countDifference, defaultConfig, mergeConfig, saveConfig } from '../../common/actions.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { ActionDefaultsPage } from './actionDefaults.js';
import { ActionsGroup } from './actionsGroup.js';

Gio._promisify(Adw.AlertDialog.prototype, 'choose');

@registerClass()
class ResetDialog extends Adw.AlertDialog {
	constructor(props: Partial<Adw.AlertDialog.ConstructorProps>) {
		super(props);

		this.add_response('cancel', _('Cancel'));
		this.add_response('reset', _('Reset'));
		this.close_response = 'reset';
		this.default_response = 'cancel';
		this.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
	}
}

@registerClass()
class RestoreDialog extends Adw.AlertDialog {
	constructor(props: Partial<Adw.AlertDialog.ConstructorProps>) {
		super(props);

		this.add_response('cancel', _('Cancel'));
		this.add_response('restore', _('Restore'));
		this.close_response = 'restore';
		this.default_response = 'cancel';
		this.set_response_appearance('restore', Adw.ResponseAppearance.SUGGESTED);
	}
}

@registerClass()
export class ActionsPage extends Adw.PreferencesPage {
	private _config: ActionConfig;
	private readonly _actionsGroup: ActionsGroup;
	private readonly _defaultsPage: ActionDefaultsPage;
	private readonly _restoreButton: Adw.PreferencesRow;
	private readonly _restoreBadge: Gtk.Label;

	constructor(
		private prefs: Preferences,
		private window: Adw.PreferencesWindow,
		config: ActionConfig,
	) {
		super({
			name: 'actions',
			title: _('Actions'),
			icon_name: Icon.Action,
		});

		this._config = config;

		this._actionsGroup = new ActionsGroup(window, this._config.actions);
		this.add(this._actionsGroup);

		const defaultsGroup = new Adw.PreferencesGroup();
		this.add(defaultsGroup);
		const defaultsButton = new Adw.ActionRow({
			title: _('Default Actions'),
			subtitle: _('Set default actions that trigger when holding control'),
			activatable: true,
		});
		defaultsGroup.add(defaultsButton);
		defaultsButton.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));

		const resetGroup = new Adw.PreferencesGroup();
		this.add(resetGroup);

		this._restoreButton = new Adw.PreferencesRow({ css_classes: ['button'], activatable: true, sensitive: false });
		resetGroup.add(this._restoreButton);
		this._restoreButton.parent.connect('row-activated', async (_listBox, row: Gtk.ListBoxRow) => {
			if (row === this._restoreButton) await this.restore();
		});

		const restoreBox = new Gtk.CenterBox({ css_classes: ['contents'] });
		this._restoreButton.child = restoreBox;
		restoreBox.center_widget = new Gtk.Label({ css_classes: ['title'], label: _('Restore Built-In Actions') });
		this._restoreBadge = new Gtk.Label({
			css_classes: ['actions-badge'],
			valign: Gtk.Align.CENTER,
			visible: false,
		});
		restoreBox.end_widget = this._restoreBadge;
		this.updateRestoreButton();

		const resetButton = new Adw.ButtonRow({ title: _('Reset Actions') });
		resetButton.add_css_class('destructive-action');
		resetButton.connect('activated', this.reset.bind(this));
		resetGroup.add(resetButton);

		this._defaultsPage = new ActionDefaultsPage(this._config);
		defaultsButton.connect('activated', () => window.push_subpage(this._defaultsPage));
		this._defaultsPage.connect('notify::defaults', () => saveConfig(prefs, this._config));

		this._actionsGroup.connect('notify::actions', () => {
			this._config.actions = this._actionsGroup.actions;
			this._defaultsPage.update(this._config);

			saveConfig(prefs, this._config);
			this.updateRestoreButton();
		});
	}

	private async restore() {
		const resetDialog = new RestoreDialog({
			heading: _('Restore Built-In Actions?'),
			body: _(
				'Restoring the built-in actions will restore built-in actions that were removed. Custom actions will remain unchanged',
			),
		});

		const response = await resetDialog.choose(this.window, null);
		if (response !== 'restore') return;

		this._config = mergeConfig(this._config, defaultConfig(this.prefs));
		saveConfig(this.prefs, this._config, true);
		this.updateRestoreButton();

		this._actionsGroup.actions = this._config.actions;
		this._defaultsPage.setDefaults(this._config);
	}

	private async reset() {
		const resetDialog = new ResetDialog({
			heading: _('Reset Actions?'),
			body: _('Resetting the actions will delete all custom actions'),
		});

		const response = await resetDialog.choose(this.window, null);
		if (response !== 'reset') return;

		this._config = defaultConfig(this.prefs);
		saveConfig(this.prefs, this._config, true);
		this.updateRestoreButton();

		this._actionsGroup.actions = this._config.actions;
		this._defaultsPage.setDefaults(this._config);
	}

	private updateRestoreButton() {
		const count = countDifference(this._config, defaultConfig(this.prefs));
		this._restoreBadge.label = count.toString();
		this._restoreBadge.visible = count > 0;
		this._restoreButton.sensitive = count > 0;
	}
}
