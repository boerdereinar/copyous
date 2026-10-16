import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Run the real TypeScript logic with a small actor/GI substitute. Rendering and
// native signal behavior still require validation inside GNOME Shell.
function load(path, modules) {
	const source = readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			experimentalDecorators: true,
		},
	});
	const exports = {};
	new Function('require', 'exports', outputText)((name) => {
		assert.ok(name in modules, `Missing mock: ${name}`);
		const mock = modules[name];
		return 'default' in mock ? { __esModule: true, ...mock } : mock;
	}, exports);
	return exports;
}

class Actor {
	signals = new Map();
	connect(name, callback) {
		const callbacks = this.signals.get(name) ?? [];
		callbacks.push(callback);
		this.signals.set(name, callbacks);
		return callbacks.length;
	}
	children = [];
	visible = true;
	parent = null;
	get_children() {
		this.copies = (this.copies ?? 0) + 1;
		return [...this.children];
	}
	get_first_child() {
		return this.children[0] ?? null;
	}
	get_last_child() {
		return this.children.at(-1) ?? null;
	}
	get_next_sibling() {
		return this.parent?.children[this.parent.children.indexOf(this) + 1] ?? null;
	}
	get_parent() {
		return this.parent;
	}
	get_n_children() {
		return this.children.length;
	}
	add_child(child) {
		assert.equal(child.parent, null);
		this.children.push(child);
		child.parent = this;
	}
	remove_child(child) {
		this.children.splice(this.children.indexOf(child), 1);
		child.parent = null;
	}
	insert_child_below(child, sibling) {
		assert.equal(child.parent, null);
		this.children.splice(this.children.indexOf(sibling), 0, child);
		child.parent = this;
	}
	pseudoclasses = new Set();
	add_style_pseudo_class(name) {
		this.pseudoclasses.add(name);
	}
	remove_style_pseudo_class(name) {
		this.pseudoclasses.delete(name);
	}
	has_key_focus() {
		return false;
	}
	destroy() {
		this.destroyCalls = (this.destroyCalls ?? 0) + 1;
		this.destroyed = true;
		for (const callback of this.signals.get('destroy') ?? []) callback();
		this.parent?.remove_child(this);
	}
}

let comparisons = 0;
class Item extends Actor {
	constructor(time, id = time) {
		super();
		this.id = id;
		this.time = time;
		const owner = this;
		this.entry = {
			datetime: {
				compare: (other) => {
					comparisons++;
					return this.time - other.value;
				},
				get value() {
					return owner.time;
				},
			},
			connectObject() {},
		};
	}
}
const State = { Empty: 'empty', NoResults: 'no-results' };
const { ClipboardScrollContainer: Container } = load('lib/ui/clipboardScrollContainer.ts', {
	'gi://Clutter': {
		default: {
			ActorAlign: { CENTER: 1, START: 2 },
			Orientation: { HORIZONTAL: 0, VERTICAL: 1 },
			TextDirection: { RTL: 1 },
		},
	},
	'gi://St': { default: { BoxLayout: Actor } },
	'../common/gjs.js': { registerClass: () => (cls) => cls },
	'../misc/actor.js': {
		get_first_visible_child: (actor) => actor.children.find((child) => child.visible),
		get_last_visible_child: (actor) => actor.children.findLast((child) => child.visible),
	},
	'./items/clipboardItem.js': { ClipboardItem: Item },
	'./items/statusItem.js': { State, StatusItem: Actor },
	'./searchEntry.js': { SearchChange: { Different: 1 } },
});

test('insertion preserves descending order and newest-first ties after moves', () => {
	const list = new Container();
	const expected = [];
	let seed = 42;
	for (let i = 0; i < 500; i++) {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		const item = new Item(seed % 50, i);
		const index = expected.findIndex((other) => other.time <= item.time);
		expected.splice(index < 0 ? expected.length : index, 0, item);
		list.addItem(item);
		assert.deepEqual(list.children, expected);
	}
	const item = expected.splice(250, 1)[0];
	const index = expected.findIndex((other) => other.time <= item.time);
	expected.splice(index < 0 ? expected.length : index, 0, item);
	list.insertOrMoveItem(item, false);
	assert.deepEqual(list.children, expected);
	expected.splice(expected.indexOf(item), 1);
	item.time = 100;
	expected.unshift(item);
	list.insertOrMoveItem(item, false);
	assert.deepEqual(list.children, expected);
});

test('ordered history uses linear timestamp comparisons and no actor-list copies', () => {
	for (const direction of [1, -1]) {
		comparisons = 0;
		const list = new Container();
		for (let i = 0; i < 5000; i++) list.addItem(new Item(i * direction));
		assert.ok(comparisons <= 10000, `${comparisons} comparisons`);
		assert.equal(list.copies ?? 0, 0);
		assert.equal(list.children.length, 5000);
	}
});

test('empty and filtered status survives repeated updates and clearing destroys items', () => {
	const list = new Container();
	list.updateVisible();
	assert.equal(list.children.length, 1);
	assert.equal(list.children[0].state, State.Empty);
	const item = new Item(1);
	list.addItem(item);
	item.visible = false;
	list.updateVisible();
	assert.equal(list.children.at(-1).state, State.NoResults);
	list.clearItems();
	assert.equal(item.destroyed, true);
	assert.equal(list.children.length, 1);
	assert.equal(list.children[0].state, State.Empty);
});

const paramSpec = new Proxy({}, { get: () => () => ({}) });
function mediaFixture({ successAt = Infinity, throws = false, throwAt = Infinity } = {}) {
	const timers = new Map();
	let queryCount = 0;
	let timerId = 0;
	let cancelHandler;
	const states = [];
	const pipeline = {
		set_state: (state) => states.push(state),
		query_duration: () => {
			queryCount++;
			if (throws || queryCount === throwAt) throw new Error('pipeline failed');
			return [queryCount >= successAt, 100];
		},
	};
	const cancellable = {
		cancelled: false,
		is_cancelled() {
			return this.cancelled;
		},
		connect(fn) {
			cancelHandler = fn;
			return 1;
		},
		disconnect() {
			cancelHandler = null;
		},
		cancel() {
			this.cancelled = true;
			cancelHandler?.();
		},
	};
	const { tryCreateMediaFileInfo } = load('lib/ui/components/contentInfo.ts', {
		'gi://Clutter': { default: { ActorAlign: {} } },
		'gi://GLib': {
			default: {
				timeout_add: (_priority, _interval, fn) => {
					timers.set(++timerId, fn);
					return timerId;
				},
				source_remove: (id) => {
					assert.ok(timers.has(id), 'removed a stale media timer');
					return timers.delete(id);
				},
				SOURCE_REMOVE: false,
				SOURCE_CONTINUE: true,
			},
		},
		'gi://GObject': { default: { ParamSpec: paramSpec, ParamFlags: {} } },
		'gi://GdkPixbuf': { default: {} },
		'gi://Gio': { default: { _promisify() {}, File: class {} } },
		'gi://Gst': {
			default: {
				is_initialized: () => true,
				parse_launch: () => pipeline,
				State: { PAUSED: 1, PLAYING: 2, NULL: 0 },
				Format: { TIME: 0 },
			},
		},
		'gi://St': { default: { BoxLayout: Actor, Label: Actor } },
		'resource:///org/gnome/shell/extensions/extension.js': { gettext: (text) => text },
		'../../common/gjs.js': { registerClass: () => (cls) => cls, enumParamSpec() {} },
		'../../common/icons.js': {},
		'../../common/settings.js': { TextCountMode: {} },
		'./contentPreview.js': {},
	});
	return {
		cancellable,
		states,
		timers,
		run: () =>
			tryCreateMediaFileInfo({ logger: { error() {} } }, { get_uri: () => 'file:///test' }, 0, cancellable),
		tick: () => {
			for (const [id, fn] of timers) if (!fn()) timers.delete(id);
		},
	};
}

test('media cancellation settles work and stops the pipeline, including after a retry', async () => {
	const fixture = mediaFixture();
	const pending = fixture.run();
	fixture.tick();
	fixture.cancellable.cancel();
	assert.equal(await pending, null);
	assert.equal(fixture.timers.size, 0);
	assert.equal(fixture.states.at(-1), 0);
});

test('media timeout and pipeline errors always stop the pipeline', async () => {
	const fixture = mediaFixture();
	const pending = fixture.run();
	for (let i = 0; i < 6; i++) fixture.tick();
	assert.equal(await pending, null);
	assert.equal(fixture.states.at(-1), 0);
	assert.equal(fixture.timers.size, 0);
	const failure = mediaFixture({ throws: true });
	assert.equal(await failure.run(), null);
	assert.equal(failure.states.at(-1), 0);
});

class Label extends Actor {
	constructor(props = {}) {
		super();
		// GObject assigns custom properties during the parent constructor, before
		// derived fields and parameter properties have been initialized.
		for (const key of ['code', 'language', 'syntaxHighlighting', 'showLineNumbers', 'tabWidth']) {
			if (key in props) this[key] = props[key];
		}
	}
	clutter_text = {
		set_markup: (text) => {
			this.markup = text;
		},
	};
	notify() {}
}
const { CodeLabel, applyTheme } = load('lib/ui/components/codeLabel.ts', {
	'gi://Clutter': { default: {} },
	'gi://GLib': {
		default: {
			markup_escape_text: (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
		},
	},
	'gi://GObject': { default: { ParamSpec: paramSpec, ParamFlags: {} } },
	'gi://Pango': { default: { WrapMode: {}, EllipsizeMode: {} } },
	'gi://St': { default: { Label } },
	'../../common/gjs.js': { registerClass: () => (cls) => cls },
	'../../common/settings.js': { CustomColorScheme: { Light: 1 } },
	'./label.js': { normalizeIndentation: (text) => text, trim: (text) => text.trim() },
});

test('theme changes preserve highlighted markup without running the highlighter again', () => {
	let highlights = 0;
	let themeChanged;
	const raw = '<span class="hljs-keyword">const</span> value = 1;';
	const ext = {
		themeManager: {
			colorScheme: 0,
			connect: (_signal, callback) => {
				themeChanged = callback;
				return 1;
			},
			disconnect() {},
		},
		hljs: {
			getLanguage: () => ({ name: 'JavaScript' }),
			highlight: () => {
				highlights++;
				return { value: raw };
			},
		},
		connectHljsInit: () => () => {},
	};
	const label = new CodeLabel(ext, {
		code: 'const value = 1;',
		language: { id: 'javascript' },
		showLineNumbers: false,
	});
	assert.equal(highlights, 1);
	for (const scheme of [1, 0, 1]) {
		ext.themeManager.colorScheme = scheme;
		themeChanged();
		assert.equal(label.markup, '\n' + applyTheme(scheme, raw));
	}
	assert.equal(highlights, 1);
	label.syntaxHighlighting = false;
	label.code = '<value & other>';
	themeChanged();
	assert.equal(label.markup, '\n&lt;value &amp; other&gt;');
});

test('viewport priority follows dynamic heights and RTL and reuses the cached item list', () => {
	for (const [orientation, rtl] of [
		[0, false],
		[0, true],
		[1, false],
	]) {
		const list = new Container();
		const urgent = [];
		for (let i = 0; i < 100; i++) {
			const item = new Item(100 - i, i);
			const start = (i * (i + 1)) / 2;
			const end = ((i + 1) * (i + 2)) / 2;
			item.has_allocation = () => true;
			item.get_allocation_box = () => ({
				x1: rtl ? 5050 - end : start,
				x2: rtl ? 5050 - start : end,
				y1: start,
				y2: end,
			});
			item.prioritizePreviews = () => urgent.push(i);
			item.deprioritizePreviews = () => {};
			list.addItem(item);
		}
		list.mapped = true;
		list.orientation = orientation;
		list.text_direction = rtl ? 1 : 0;
		list.hadjustment = list.vadjustment = { value: 55, page_size: 12, upper: 5050 };
		list.prioritizePreviews();
		assert.deepEqual(urgent, [10, 11]);
		const copies = list.copies;
		urgent.length = 0;
		list.hadjustment.value = 66;
		list.prioritizePreviews();
		assert.deepEqual(urgent, [11]);
		assert.equal(list.copies, copies);
		list._lastQuery = {};
		const item = list.children[11];
		item.search = () => {};
		list.updateSearch(item);
		list.prioritizePreviews();
		assert.equal(list.copies, copies, 'unchanged search results must retain the viewport index');
	}
});

test('native label destruction disconnects callbacks and cancels pending highlighting exactly once', async () => {
	const { WorkQueue } = load('lib/misc/workQueue.ts', {});
	const callbacks = [];
	const queue = new WorkQueue((callback) => {
		callbacks.push(callback);
		return () => {};
	}, 1);
	let initialized;
	let disconnected = 0;
	let themeDisconnected = 0;
	let highlights = 0;
	const ext = {
		previewQueue: queue,
		logger: {
			error(error) {
				throw error;
			},
		},
		hljs: null,
		themeManager: { connect: () => 1, disconnect: () => themeDisconnected++ },
		connectHljsInit: (callback) => {
			initialized = callback;
			return () => disconnected++;
		},
	};
	const label = new CodeLabel(ext, { code: 'sample', showLineNumbers: false });
	ext.hljs = {
		getLanguage: () => null,
		highlightAuto: () => {
			highlights++;
			return { value: 'sample' };
		},
	};
	initialized();
	// Simulate native destruction by a parent; the child's JS destroy override is not called.
	Actor.prototype.destroy.call(label);
	label.destroy();
	for (const callback of callbacks) callback();
	for (let i = 0; i < 8; i++) await Promise.resolve();
	assert.equal(highlights, 0);
	assert.equal(disconnected, 1);
	assert.equal(themeDisconnected, 1);
	queue.destroy();
});

test('media polling exceptions settle the request and stop the pipeline', async () => {
	const fixture = mediaFixture({ throwAt: 2 });
	const pending = fixture.run();
	assert.doesNotThrow(() => fixture.tick());
	assert.equal(await pending, null);
	assert.equal(fixture.timers.size, 0);
	assert.equal(fixture.states.at(-1), 0);
});

test('cancellation immediately after a successful poll never removes an expired timer', async () => {
	const fixture = mediaFixture({ successAt: 2 });
	const pending = fixture.run();
	fixture.tick();
	assert.doesNotThrow(() => fixture.cancellable.cancel());
	assert.equal(await pending, null);
	assert.equal(fixture.timers.size, 0);
	assert.equal(fixture.states.at(-1), 0);
});

test('initial code properties are applied after the GObject parent constructor and do not highlight disabled syntax', () => {
	const ext = {
		hljs: {
			getLanguage: () => null,
			highlightAuto: () => {
				throw new Error('highlighting disabled');
			},
		},
		connectHljsInit: () => () => {},
	};
	const label = new CodeLabel(ext, {
		code: '<value & other>',
		syntaxHighlighting: false,
		showLineNumbers: false,
		tabWidth: 8,
	});
	assert.equal(label.markup, '\n&lt;value &amp; other&gt;');
	assert.equal(label.syntaxHighlighting, false);
	assert.equal(label.showLineNumbers, false);
	assert.equal(label.tabWidth, 8);
});

test('native container destruction destroys detached status actors once and releases cached actor references', () => {
	const list = new Container();
	const status = list.children[0];
	const item = new Item(1);
	list.addItem(item);
	list._previewOrder = [item];
	list._foregroundItems.add(item);
	Actor.prototype.destroy.call(list);
	assert.equal(status.destroyCalls, 1);
	assert.equal(list._previewOrder, null);
	assert.equal(list._foregroundItems.size, 0);
	const attached = new Container();
	const attachedStatus = attached.children[0];
	attachedStatus.destroy();
	Actor.prototype.destroy.call(attached);
	assert.equal(attachedStatus.destroyCalls, 1);
});

// The dialog initializes its query before asynchronous startup history arrives.
test('startup insertion finalizes status and edge styling even when search visibility is unchanged', () => {
	const list = new Container();
	list._lastQuery = {};
	assert.equal(list._statusItem.state, State.Empty);
	const excluded = new Item(1);
	excluded.search = () => {
		excluded.visible = false;
	};
	list.addItem(excluded);
	assert.equal(list._statusItem.state, State.NoResults);
	const first = new Item(2);
	first.search = () => {};
	list.addItem(first);
	assert.equal(list._statusItem.get_parent(), null);
	assert.deepEqual([...first.pseudoclasses].sort(), ['first-child', 'last-child']);
	const newest = new Item(3);
	newest.search = () => {};
	list.addItem(newest);
	assert.equal(list._statusItem.get_parent(), null);
	assert.deepEqual([...newest.pseudoclasses], ['first-child']);
	assert.deepEqual([...first.pseudoclasses], ['last-child']);
	list.clearItems();
	assert.equal(list._statusItem.get_parent(), list);
	assert.equal(list._statusItem.state, State.Empty);
	const reloaded = new Item(4);
	reloaded.search = () => {};
	list.addItem(reloaded);
	assert.equal(list._statusItem.get_parent(), null);
});
