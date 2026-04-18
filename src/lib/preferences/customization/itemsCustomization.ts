import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../prefs.js';
import { registerClass } from '../../common/gjs.js';
import { CharacterItemCustomization } from './items/characterItemCustomization.js';
import { CodeItemCustomization } from './items/codeItemCustomization.js';
import { FileItemCustomization } from './items/fileItemCustomization.js';
import { ImageItemCustomization } from './items/imageItemCustomization.js';
import { LinkItemCustomization } from './items/linkItemCustomization.js';
import { TextItemCustomization } from './items/textItemCustomization.js';

@registerClass({
	Properties: {
		hljs: GObject.ParamSpec.boolean('hljs', null, null, GObject.ParamFlags.READWRITE, false),
	},
})
export class ItemsCustomization extends Adw.PreferencesGroup {
	constructor(prefs: Preferences, window: Adw.PreferencesWindow) {
		super({
			title: _('Items'),
		});

		this.add(new TextItemCustomization(prefs));
		const code = new CodeItemCustomization(prefs);
		this.add(code);
		this.add(new ImageItemCustomization(prefs));
		const file = new FileItemCustomization(prefs, window);
		this.add(file);
		this.add(new LinkItemCustomization(prefs, window));
		this.add(new CharacterItemCustomization(prefs));

		this.bind_property('hljs', code, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
		this.bind_property('hljs', file, 'hljs', GObject.BindingFlags.SYNC_CREATE);
	}
}
