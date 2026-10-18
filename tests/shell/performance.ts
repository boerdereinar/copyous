import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import type CopyousExtension from '../../src/extension.js';

export const METRICS = {
	copyousLatencyFirst: {
		description: 'Time to first frame after triggering copyous, first time',
		units: 'ms',
		value: 0,
	},
	copyousLatencySubsequent: {
		description: 'Time to first frame after triggering copyous, second time',
		units: 'ms',
		value: 0,
	},
};

const UUID = 'copyous@boerdereinar.dev';

async function waitForExtensionState(): Promise<CopyousExtension> {
	for (let i = 0; i < 50; i++) {
		const extension = Main.extensionManager.lookup(UUID);
		if (extension) {
			if (extension.state === ExtensionState.ERROR)
				throw new Error(`Extension ${UUID} failed: ${extension.error}`);

			// ExtensionState.ENABLED
			if (extension.state === (1 as ExtensionState)) {
				return extension.stateObj as CopyousExtension;
			}
		}

		// eslint-disable-next-line no-await-in-loop
		await Scripting.sleep(1000);
	}

	throw new Error(`Timed out waiting for ${UUID}`);
}

export async function run() {
	Scripting.defineScriptEvent('copyousOpenStart', 'Starting to open copyous');
	Scripting.defineScriptEvent('copyousOpenDone', 'Copyous finished opening');

	const extension = await waitForExtensionState();

	Scripting.scriptEvent('copyousOpenStart');
	extension.clipboardDialog?.open();
	await Scripting.waitLeisure();

	Scripting.scriptEvent('copyousOpenDone');

	extension.clipboardDialog?.close();
	await Scripting.waitLeisure();

	await Scripting.sleep(1000);
	await Scripting.waitLeisure();

	Scripting.scriptEvent('copyousOpenStart');
	extension.clipboardDialog?.open();
	await Scripting.waitLeisure();

	Scripting.scriptEvent('copyousOpenDone');
}

let copyousOpenStart = 0;
let copyousOpenCount = 0;

export function script_copyousOpenStart(time: number) {
	copyousOpenStart = time;
}

export function script_copyousOpenDone(time: number) {
	copyousOpenCount++;
	if (copyousOpenCount === 1) {
		METRICS.copyousLatencyFirst.value = (time - copyousOpenStart) / 1000;
	} else {
		METRICS.copyousLatencySubsequent.value = (time - copyousOpenStart) / 1000;
	}
}
