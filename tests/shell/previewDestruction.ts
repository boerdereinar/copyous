import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
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
	const uri = extension.dir.get_uri();
	const { LinkItem } = await import(`${uri}/lib/ui/items/linkItem.js`);
	const { ClipboardEntry } = await import(`${uri}/lib/database/database.js`);
	const { ItemType } = await import(`${uri}/lib/common/constants.js`);
	const server = new Soup.Server();
	server.add_handler(null, (_server, message) => {
		message.set_status(200, null);
		message.set_response('text/html', Soup.MemoryUse.COPY, '<title>Delayed metadata</title>');
		let finished = false;
		message.connect('finished', () => {
			finished = true;
		});
		message.pause();
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
			if (!finished) message.unpause();
			return GLib.SOURCE_REMOVE;
		});
	});
	server.listen_local(0, Soup.ServerListenOptions.IPV4_ONLY);
	const entry = new ClipboardEntry(
		1,
		ItemType.Link,
		server.get_uris()[0]!.to_string(),
		false,
		null,
		GLib.DateTime.new_now_utc(),
	);
	const parent = new St.Widget();
	let destroyed = false;
	parent.connect('destroy', () => {
		destroyed = true;
	});
	try {
		parent.add_child(new LinkItem(extension.stateObj, entry));
		await Scripting.sleep(50);
		parent.destroy(); // C recursive destruction bypasses the LinkItem JS override.
		await Scripting.sleep(300);
		if (entry.metadata !== null) throw new Error('Destroyed link card must not publish late metadata');
	} finally {
		if (!destroyed) parent.destroy();
		server.disconnect();
	}
	console.log('Copyous native preview destruction regression passed');
}
