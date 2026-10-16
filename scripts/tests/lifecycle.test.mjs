import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Execute actual lifecycle methods without importing GNOME Shell UI modules.
function subject(path, className, names, globals = {}) {
	const source = readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
	const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
	const cls = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === className);
	assert.ok(cls);
	const methods = cls.members.filter(
		(node) => ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast)),
	);
	const { outputText } = ts.transpileModule(
		`class Subject { ${methods.map((node) => node.getText(ast)).join('\n')} } exports.Subject = Subject;`,
		{
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		},
	);
	const exports = {};
	new Function('exports', ...Object.keys(globals), outputText)(exports, ...Object.values(globals));
	return new exports.Subject();
}
function deferred() {
	let resolve;
	const promise = new Promise((res) => {
		resolve = res;
	});
	return { promise, resolve };
}
function timeoutFixture() {
	const timers = new Map();
	let id = 0;
	const app = subject('extension.ts', 'CopyousExtension', ['initHistoryTimeout'], {
		GLib: {
			source_remove: (key) => {
				assert.ok(timers.delete(key), 'removed a stale source');
			},
			timeout_add_seconds: (_priority, _seconds, callback) => {
				timers.set(++id, callback);
				return id;
			},
		},
	});
	app.historyTimeoutId = -1;
	app.historyTimeoutGeneration = 0;
	let historyTime = 5;
	const requests = [];
	app.settings = { get_int: () => historyTime };
	app.entryTracker = {
		deleteOldest: () => {
			const request = deferred();
			requests.push(request);
			return request.promise;
		},
	};
	return {
		app,
		timers,
		requests,
		setTime: (time) => {
			historyTime = time;
		},
	};
}

test('an older history-time request cannot install a second timer after a newer request', async () => {
	const { app, timers, requests } = timeoutFixture();
	const first = app.initHistoryTimeout();
	const second = app.initHistoryTimeout();
	requests[1].resolve();
	await second;
	requests[0].resolve();
	await first;
	assert.equal(timers.size, 1);
});

test('turning history expiry off invalidates pending timer setup and never removes stale source IDs', async () => {
	const { app, timers, requests, setTime } = timeoutFixture();
	const pending = app.initHistoryTimeout();
	setTime(0);
	await app.initHistoryTimeout();
	requests[0].resolve();
	await pending;
	assert.equal(timers.size, 0);
	setTime(5);
	const enabled = app.initHistoryTimeout();
	requests[1].resolve();
	await enabled;
	setTime(0);
	await app.initHistoryTimeout();
	await app.initHistoryTimeout();
	assert.equal(timers.size, 0);
});

test('late history expiry initialization cannot register a timer after extension shutdown', async () => {
	const { app, timers, requests } = timeoutFixture();
	const pending = app.initHistoryTimeout();
	app.settings = undefined;
	app.entryTracker = undefined;
	requests[0].resolve();
	await pending;
	assert.equal(timers.size, 0);
});

test('failed actor attachment destroys the actor and does not retain a displayed entry', () => {
	let actor;
	class TextItem {
		constructor() {
			actor = this;
		}
		connect() {}
		connectObject() {
			throw new Error('attachment failed');
		}
		destroy() {
			this.destroyed = true;
		}
	}
	const dialog = subject('lib/ui/clipboardDialog.ts', 'ClipboardDialog', ['addEntry', 'attachEntry'], {
		ItemType: { Text: 'Text' },
		TextItem,
	});
	const errors = [];
	dialog.ext = { logger: { error: (error) => errors.push(error) } };
	dialog._displayedEntries = new Set();
	assert.doesNotThrow(() => dialog.addEntry({ type: 'Text' }));
	assert.equal(actor.destroyed, true);
	assert.equal(dialog._displayedEntries.size, 0);
	assert.equal(errors.length, 1);
});

function reloadFixture() {
	const app = subject('extension.ts', 'CopyousExtension', [
		'initEntryTracker',
		'startHistoryReload',
		'reloadHistory',
	]);
	const requests = [];
	const loaded = [];
	const errors = [];
	app.logger = { error: (error) => errors.push(error) };
	app.entryTrackerInit = null;
	app.entryTrackerInitQueued = false;
	app.clipboardDialog = { clearEntries() {}, loadEntries: (entries) => loaded.push(entries) };
	app.entryTracker = {
		shouldInit: true,
		init: () => {
			let resolve;
			let reject;
			const promise = new Promise((res, rej) => {
				resolve = res;
				reject = rej;
			});
			requests.push({ resolve, reject });
			return promise;
		},
	};
	return { app, requests, loaded, errors };
}
async function settle() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

test('overlapping reload requests serialize initialization and publish only the latest history', async () => {
	const { app, requests, loaded } = reloadFixture();
	const first = app.initEntryTracker();
	const second = app.initEntryTracker();
	assert.equal(requests.length, 1);
	requests[0].resolve(['obsolete']);
	await settle();
	assert.equal(requests.length, 2);
	assert.deepEqual(loaded, []);
	requests[1].resolve(['latest']);
	await Promise.all([first, second]);
	assert.deepEqual(loaded, [['latest']]);
	assert.equal(app.entryTrackerInit, null);
});

test('an accepted pending reload survives initialization failure without rechecking the admission guard', async () => {
	const { app, requests, loaded } = reloadFixture();
	let admissions = 0;
	Object.defineProperty(app.entryTracker, 'shouldInit', { get: () => ++admissions <= 2 });
	const failed = app.initEntryTracker();
	const checked = assert.rejects(failed, /initialization failed/);
	app.initEntryTracker();
	requests[0].reject(new Error('initialization failed'));
	await checked;
	await settle();
	assert.equal(requests.length, 2, 'accepted reload was dropped');
	assert.equal(admissions, 2);
	requests[1].resolve(['recovered']);
	await settle();
	assert.deepEqual(loaded, [['recovered']]);
});

test('completion from a previous extension session cannot replace the new session history or pending promise', async () => {
	const { app, requests, loaded } = reloadFixture();
	const previous = app.initEntryTracker();
	app.entryTrackerInit = null;
	app.entryTrackerInitQueued = false;
	app.clipboardDialog = { clearEntries() {}, loadEntries: (entries) => loaded.push(entries) };
	app.entryTracker = { ...app.entryTracker };
	const current = app.initEntryTracker();
	requests[0].resolve(['old session']);
	await previous;
	assert.equal(app.entryTrackerInit, current);
	assert.deepEqual(loaded, []);
	requests[1].resolve(['new session']);
	await current;
	assert.deepEqual(loaded, [['new session']]);
});

test('a natively destroyed dialog ignores late database results and cannot construct more actors', () => {
	const dialog = subject('lib/ui/clipboardDialog.ts', 'ClipboardDialog', ['loadEntries', 'addEntry', 'destroy']);
	dialog._disposed = true;
	dialog._historyLoader = {
		replace() {
			assert.fail('queued history after destruction');
		},
	};
	dialog._displayedEntries = new Set();
	assert.doesNotThrow(() => dialog.loadEntries([{}], () => true));
	assert.doesNotThrow(() => dialog.addEntry({}));
	assert.doesNotThrow(() => dialog.destroy());
});
