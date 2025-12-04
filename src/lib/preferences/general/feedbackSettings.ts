import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { Sound, SoundManager } from '../../common/sound.js';
import { makeResettable } from '../utils.js';

@registerClass()
class SoundVolumeRow extends Adw.PreferencesRow {
	slider: Gtk.Scale;

	constructor() {
		super({
			activatable: false,
		});

		const box = new Gtk.Box({
			css_classes: ['header'],
		});
		this.child = box;

		box.append(
			new Gtk.Image({
				icon_name: Icon.Volume,
				margin_start: 6,
				margin_end: 6,
			}),
		);

		this.slider = new Gtk.Scale({
			valign: Gtk.Align.CENTER,
			hexpand: true,
			draw_value: true,
			value_pos: Gtk.PositionType.RIGHT,
			digits: 0,
			adjustment: new Gtk.Adjustment({ lower: -20, upper: 20, step_increment: 1, value: 0 }),
		});
		box.append(this.slider);

		this.slider.add_mark(0, Gtk.PositionType.BOTTOM, null);
		this.slider.set_format_value_func((_slider, value: number) => {
			const sign = value >= 0 ? '+' : '';
			return ` ${sign}${value} dB`;
		});

		const separator = new Gtk.Separator({
			orientation: Gtk.Orientation.VERTICAL,
			margin_top: 9,
			margin_bottom: 9,
			margin_start: 6,
		});
		box.append(separator);

		const resetButton = new Gtk.Button({
			icon_name: Icon.Undo,
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
			sensitive: false,
		});
		box.append(resetButton);

		resetButton.connect('clicked', () => (this.slider.adjustment.value = 0));
		this.slider.adjustment.connect(
			'notify::value',
			() => (resetButton.sensitive = this.slider.adjustment.value !== 0),
		);
	}
}

@registerClass({
	Properties: {
		active: GObject.ParamSpec.boolean('active', null, null, GObject.ParamFlags.READWRITE, false),
	},
})
class CheckRow<T> extends Adw.ActionRow {
	private readonly _value: T;
	private readonly _checkButton: Gtk.CheckButton;

	constructor(title: string, value: T, group?: CheckRow<T>) {
		super({
			title: title,
			activatable: true,
		});

		this._value = value;

		this._checkButton = new Gtk.CheckButton();
		this.add_prefix(this._checkButton);
		this.set_activatable_widget(this._checkButton);

		if (group) {
			this._checkButton.group = group._checkButton;
		}
	}

	get active() {
		return this._checkButton.active;
	}

	set active(value: boolean) {
		this._checkButton.active = value;
	}

	get value() {
		return this._value;
	}
}

@registerClass({
	Properties: {
		sound: GObject.ParamSpec.string('sound', null, null, GObject.ParamFlags.READWRITE, Sound.None),
		volume: GObject.ParamSpec.double('volume', null, null, GObject.ParamFlags.READWRITE, -20, 20, 0),
	},
})
class SoundChooserPage extends Adw.NavigationPage {
	private _soundManager: SoundManager;
	private _sound: Sound = Sound.None;

	private readonly _volumeRow: SoundVolumeRow;
	private readonly _rows: { [sound in Sound]: CheckRow<Sound> };

	constructor(soundManager: SoundManager) {
		super({
			title: _('Sound'),
		});

		this._soundManager = soundManager;

		const toolbarView = new Adw.ToolbarView();
		toolbarView.add_top_bar(new Adw.HeaderBar());
		this.child = toolbarView;

		const page = new Adw.PreferencesPage();
		toolbarView.content = page;

		// Volume row
		const volumeGroup = new Adw.PreferencesGroup();
		page.add(volumeGroup);

		this._volumeRow = new SoundVolumeRow();
		volumeGroup.add(this._volumeRow);

		this.bind_property('volume', this._volumeRow.slider.adjustment, 'value', GObject.BindingFlags.BIDIRECTIONAL);

		// Sound chooser
		const soundChooser = new Adw.PreferencesGroup();
		page.add(soundChooser);

		// None
		const noneRow = new CheckRow(_('None'), Sound.None);
		noneRow.active = true;

		this._rows = {
			[Sound.None]: noneRow,
			[Sound.Click]: new CheckRow(_('Click'), Sound.Click, noneRow),
			[Sound.Hum]: new CheckRow(_('Hum'), Sound.Hum, noneRow),
			[Sound.String]: new CheckRow(_('String'), Sound.String, noneRow),
			[Sound.Swing]: new CheckRow(_('Swing'), Sound.Swing, noneRow),
			[Sound.Message]: new CheckRow(_('Message'), Sound.Message, noneRow),
			[Sound.MessageNewInstant]: new CheckRow(_('Message New Instant'), Sound.MessageNewInstant, noneRow),
			[Sound.Bell]: new CheckRow(_('Bell'), Sound.Bell, noneRow),
			[Sound.DialogWarning]: new CheckRow(_('Dialog Warning'), Sound.DialogWarning, noneRow),
		};

		for (const [sound, row] of Object.entries(this._rows) as [Sound, CheckRow<Sound>][]) {
			row.visible = sound === Sound.None || soundManager.hasSound(sound as Sound);
			row.connect('activated', this.toggled.bind(this));
			soundChooser.add(row);
		}
	}

	get sound() {
		return this._sound;
	}

	set sound(value: Sound) {
		this._sound = value;

		const row = this._rows[value];
		row.active = true;
		this.notify('sound');
	}

	get volume() {
		return this._volumeRow.slider.get_value();
	}

	set volume(value: number) {
		this._volumeRow.slider.set_value(value);
		this.notify('volume');
	}

	private toggled(row: CheckRow<Sound>) {
		if (row.active) {
			this.sound = row.value;
			this._soundManager.playSound(row.value, this.volume);
		}
	}
}

@registerClass({
	Properties: {
		gsound: GObject.ParamSpec.boolean('gsound', null, null, GObject.ParamFlags.READWRITE, false),
	},
})
export class FeedbackSettings extends Adw.PreferencesGroup {
	declare gsound: boolean;

	private _soundManager?: SoundManager;
	private _soundChooserPage?: SoundChooserPage;

	private readonly _soundLabel: Gtk.Label;

	constructor(prefs: ExtensionPreferences, window: Adw.PreferencesWindow) {
		super({
			title: _('Feedback'),
		});

		const showIndicator = new Adw.SwitchRow({
			title: _('Show Indicator'),
			subtitle: _('Show an indicator on the top panel'),
		});
		this.add(showIndicator);

		const showContentIndicator = new Adw.SwitchRow({
			title: _('Show Clipboard Content in Indicator'),
			subtitle: _('Show the current clipboard content in the indicator'),
		});
		this.add(showContentIndicator);
		showIndicator.bind_property('active', showContentIndicator, 'sensitive', null);
		this.connect('map', () => (showContentIndicator.sensitive = showIndicator.active));

		const wiggleIndicator = new Adw.SwitchRow({
			title: _('Wiggle Indicator'),
			subtitle: _('Wiggle the indicator when a clipboard item is copied'),
		});
		this.add(wiggleIndicator);

		const sendNotification = new Adw.SwitchRow({
			title: _('Send Notification'),
			subtitle: _('Send a notification when a clipboard item is copied'),
		});
		this.add(sendNotification);

		const playSound = new Adw.ActionRow({
			title: _('Sound'),
			subtitle: _('Sound to play when a clipboard item is copied'),
			activatable: true,
			sensitive: false,
		});
		this.add(playSound);

		this._soundLabel = new Gtk.Label({
			label: _('None'),
			margin_end: 8,
			css_classes: ['dim-label'],
		});
		playSound.add_suffix(this._soundLabel);
		playSound.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));

		playSound.connect('activated', () => this._soundChooserPage && window.push_subpage(this._soundChooserPage));

		// Bind properties
		const settings = prefs.getSettings();
		settings.bind('show-indicator', showIndicator, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-content-indicator', showContentIndicator, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('wiggle-indicator', wiggleIndicator, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('send-notification', sendNotification, 'active', Gio.SettingsBindFlags.DEFAULT);

		makeResettable(playSound, settings, 'sound', 'volume');

		// Check if GSound is installed
		this.connect('notify::gsound', async () => {
			if (this.gsound) {
				const GSound = (await import('gi://GSound')).default;
				this._soundManager = new SoundManager(GSound, prefs);
				this._soundChooserPage = new SoundChooserPage(this._soundManager);
				settings.bind('sound', this._soundChooserPage, 'sound', Gio.SettingsBindFlags.DEFAULT);
				settings.bind('volume', this._soundChooserPage, 'volume', Gio.SettingsBindFlags.DEFAULT);
				this._soundChooserPage.connect('notify::sound', this.updateSoundLabel.bind(this));
				this.updateSoundLabel();

				playSound.sensitive = true;
			}
		});

		this.connect('destroy', () => this._soundManager?.destroy());
	}

	private updateSoundLabel() {
		if (!this._soundChooserPage) return;

		this._soundLabel.label = (() => {
			switch (this._soundChooserPage.sound) {
				case Sound.None:
					return _('None');
				case Sound.Click:
					return _('Click');
				case Sound.Hum:
					return _('Hum');
				case Sound.String:
					return _('String');
				case Sound.Swing:
					return _('Swing');
				case Sound.Message:
					return _('Message');
				case Sound.MessageNewInstant:
					return _('Message New Instant');
				case Sound.Bell:
					return _('Bell');
				case Sound.DialogWarning:
					return _('Dialog Warning');
			}
		})();
	}
}
