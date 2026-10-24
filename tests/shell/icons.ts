import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};

export async function run() {
	let extension;
	for (let i = 0; i < 100; i++) {
		extension = Main.extensionManager.lookup('copyous@boerdereinar.dev');
		if (extension?.state === 1) break;
		await Scripting.sleep(100);
	}
	if (extension?.state !== 1) throw new Error('Extension must be enabled');
	const { Icon, loadIcon } = await import(`${extension.dir.get_uri()}/lib/common/icons.js`);
	const box = new St.BoxLayout({ x: 100, y: 100, style: 'background-color: #333; color: white;' });
	Main.uiGroup.add_child(box);
	try {
		for (let pass = 0; pass < 3; pass++) {
			const icons = Object.values(Icon).map((name) => {
				const icon = new St.Icon({ gicon: loadIcon(extension.stateObj, name), icon_size: 16 });
				box.add_child(icon);
				return icon;
			});
			// Loading SVG textures is asynchronous; bound the wait and assert native content.
			const loaded = (icon: St.Icon) =>
				icon.get_children().some((child) => {
					const content = child.get_content();
					return content instanceof St.ImageContent && content.get_texture().get_width() > 0;
				});
			for (let attempt = 0; attempt < 50 && !icons.every(loaded); attempt++) await Scripting.sleep(100);
			for (const icon of icons) {
				if (!loaded(icon)) throw new Error(`Icon did not render: ${icon.gicon?.to_string()}`);
			}
			box.hide();
			box.show();
			St.TextureCache.get_default().emit('icon-theme-changed');
			await Scripting.sleep(200);
			if (!icons.every(loaded)) throw new Error('Icon lost its texture after a theme change');
			box.destroy_all_children();
		}
	} finally {
		box.destroy();
	}
	console.log('Copyous native icon loading, remapping and theme-change checks passed');
}
