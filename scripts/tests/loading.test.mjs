import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
	readFileSync(new URL('../../src/lib/misc/workQueue.ts', import.meta.url), 'utf8'),
	{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
);
const exports = {};
new Function('exports', outputText)(exports);
const { WorkQueue, IdleBatch } = exports;

function loop() {
	let id = 0;
	const callbacks = new Map();
	return {
		schedule: (callback) => {
			const key = ++id;
			callbacks.set(key, callback);
			return () => callbacks.delete(key);
		},
		tick: async () => {
			const next = callbacks.entries().next().value;
			if (next) {
				callbacks.delete(next[0]);
				next[1]();
			}
			for (let i = 0; i < 8; i++) await Promise.resolve();
		},
		get pending() {
			return callbacks.size;
		},
	};
}
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

test('queue bounds concurrency, starts one job per turn, and prioritizes foreground work', async () => {
	const main = loop();
	const queue = new WorkQueue(main.schedule, 2);
	const waits = Array.from({ length: 4 }, deferred);
	const started = [];
	const jobs = waits.map((wait, index) =>
		queue.add(() => {
			started.push(index);
			return wait.promise;
		}),
	);
	await main.tick();
	assert.deepEqual(started, [0]);
	await main.tick();
	assert.deepEqual(started, [0, 1]);
	assert.equal(main.pending, 0);
	jobs[3].promote();
	waits[0].resolve(0);
	await main.tick();
	await main.tick();
	assert.deepEqual(started, [0, 1, 3]);
	waits[1].resolve(1);
	waits[3].resolve(3);
	await main.tick();
	await main.tick();
	assert.deepEqual(started, [0, 1, 3, 2]);
	waits[2].resolve(2);
	assert.deepEqual(await Promise.all(jobs.map((job) => job.promise)), [0, 1, 2, 3]);
});

test('reserved slot lets a visible item start without waiting for slow background requests', async () => {
	const main = loop();
	const queue = new WorkQueue(main.schedule, 3, 1);
	const wait = deferred();
	let foregroundStarted = false;
	const a = queue.add(() => wait.promise);
	const b = queue.add(() => wait.promise);
	const c = queue.add(() => {
		foregroundStarted = true;
	});
	await main.tick();
	await main.tick();
	assert.equal(main.pending, 0);
	assert.equal(foregroundStarted, false);
	c.promote();
	await main.tick();
	assert.equal(foregroundStarted, true);
	wait.resolve();
	await Promise.all([a.promise, b.promise, c.promise]);
});

test('pending cancellation settles promises and disposed queues do not start work', async () => {
	const main = loop();
	const queue = new WorkQueue(main.schedule, 1);
	let started = 0;
	const a = queue.add(() => ++started);
	const b = queue.add(() => ++started);
	b.promote();
	b.cancel();
	b.cancel();
	assert.equal(await b.promise, undefined);
	queue.destroy();
	assert.equal(main.pending, 0);
	assert.equal(await a.promise, undefined);
	assert.equal(await queue.add(() => ++started).promise, undefined);
	assert.equal(started, 0);
});

test('throws and rejections release slots; cancelling active work does not oversubscribe the queue', async () => {
	const main = loop();
	const queue = new WorkQueue(main.schedule, 1);
	const a = queue.add(() => {
		throw new Error('sync failure');
	});
	const checkedA = assert.rejects(a.promise, /sync failure/);
	const b = queue.add(() => Promise.reject(new Error('async failure')));
	const checkedB = assert.rejects(b.promise, /async failure/);
	const wait = deferred();
	const c = queue.add(() => wait.promise);
	let lastStarted = false;
	const d = queue.add(() => {
		lastStarted = true;
	});
	await main.tick();
	await main.tick();
	await main.tick();
	c.cancel();
	await main.tick();
	assert.equal(lastStarted, false);
	wait.resolve('complete');
	await main.tick();
	await main.tick();
	assert.equal(lastStarted, true);
	assert.equal(await c.promise, 'complete');
	await Promise.all([checkedA, checkedB, d.promise]);
});

test('history slices respect time and item limits, then flush completes every entry exactly once', async () => {
	const main = loop();
	let now = 0;
	const consumed = [];
	const batch = new IdleBatch(
		main.schedule,
		() => now,
		(entry) => {
			consumed.push(entry);
			now += 1500;
		},
	);
	const entries = Array.from({ length: 100 }, (_, index) => index);
	batch.replace(entries);
	assert.deepEqual(consumed, []);
	await main.tick();
	assert.deepEqual(consumed, [0, 1, 2]);
	assert.equal(main.pending, 1);
	batch.flush();
	assert.deepEqual(consumed, entries);
	assert.equal(main.pending, 0);
	batch.flush();
	assert.deepEqual(consumed, entries);
	const fast = [];
	const fastBatch = new IdleBatch(
		main.schedule,
		() => 0,
		(entry) => fast.push(entry),
	);
	fastBatch.replace(entries);
	await main.tick();
	assert.equal(fast.length, 32);
	fastBatch.clear();
	assert.equal(main.pending, 0);
});

test('replacement, clearing, and reentrant replacement cannot resurrect stale history', async () => {
	const main = loop();
	const consumed = [];
	const batch = new IdleBatch(
		main.schedule,
		() => 0,
		(entry) => {
			consumed.push(entry);
			if (entry === 1) batch.replace([10, 11]);
		},
	);
	batch.replace([0, 1, 2, 3]);
	await main.tick();
	assert.deepEqual(consumed, [0, 1]);
	await main.tick();
	assert.deepEqual(consumed, [0, 1, 10, 11]);
	batch.replace([20, 21]);
	batch.replace([30, 31]);
	batch.flush();
	assert.deepEqual(consumed, [0, 1, 10, 11, 30, 31]);
	batch.replace([40]);
	batch.clear();
	await main.tick();
	assert.deepEqual(consumed, [0, 1, 10, 11, 30, 31]);
});

test('demoting a queued viewport item releases reserved capacity for the new viewport', async () => {
	const main = loop();
	const queue = new WorkQueue(main.schedule, 2, 1);
	const wait = deferred();
	const active = queue.add(() => wait.promise);
	await main.tick();
	const started = [];
	const oldPage = queue.add(() => started.push('old'));
	oldPage.promote();
	oldPage.demote();
	await main.tick();
	assert.deepEqual(started, []);
	const newPage = queue.add(() => started.push('new'));
	newPage.promote();
	await main.tick();
	assert.deepEqual(started, ['new']);
	wait.resolve();
	await main.tick();
	await main.tick();
	assert.deepEqual(started, ['new', 'old']);
	await Promise.all([active.promise, oldPage.promise, newPage.promise]);
});

test('an item error does not strand the rest of an idle history batch', async () => {
	const main = loop();
	const consumed = [];
	const batch = new IdleBatch(
		main.schedule,
		() => 0,
		(entry) => {
			if (entry === 1) throw new Error('item failed');
			consumed.push(entry);
		},
	);
	batch.replace([0, 1, 2, 3]);
	await assert.rejects(main.tick(), /item failed/);
	assert.equal(main.pending, 1, 'remaining entries must stay scheduled');
	await main.tick();
	assert.deepEqual(consumed, [0, 2, 3]);
	assert.equal(main.pending, 0);
});

test('a flush error preserves the remaining history and replacement still cancels it', async () => {
	const main = loop();
	const consumed = [];
	const batch = new IdleBatch(
		main.schedule,
		() => 0,
		(entry) => {
			if (entry === 1) throw new Error('item failed');
			consumed.push(entry);
		},
	);
	batch.replace([0, 1, 2, 3]);
	assert.throws(() => batch.flush(), /item failed/);
	assert.equal(main.pending, 1);
	batch.replace([10]);
	await main.tick();
	assert.deepEqual(consumed, [0, 10]);
	assert.equal(main.pending, 0);
});

test('disposing after dispatch but before invocation cannot start fresh work', async () => {
	const main = loop();
	const queue = new WorkQueue(main.schedule, 1);
	let started = false;
	const job = queue.add(() => {
		started = true;
	});
	const dispatched = main.tick();
	queue.destroy();
	await dispatched;
	assert.equal(await job.promise, undefined);
	assert.equal(started, false);
});

test('mixed priority, cancellation and completion sequences preserve queue bounds and settle every job', async () => {
	let seed = 73;
	const random = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed;
	};
	for (let capacity = 1; capacity <= 4; capacity++) {
		for (let reserve = 0; reserve < capacity; reserve++) {
			const main = loop();
			const queue = new WorkQueue(main.schedule, capacity, reserve);
			const running = new Map();
			const seen = new Set();
			let settled = 0;
			const jobs = Array.from({ length: 100 }, (_, index) => {
				const job = queue.add(() => {
					assert.equal(seen.has(index), false, 'a job ran twice');
					seen.add(index);
					const wait = deferred();
					running.set(index, wait);
					assert.ok(running.size <= capacity, 'concurrency exceeded');
					return wait.promise.finally(() => running.delete(index));
				});
				void job.promise.then(
					() => settled++,
					() => settled++,
				);
				return job;
			});
			for (let i = 0; i < 300; i++) {
				const job = jobs[random() % jobs.length];
				switch (random() % 5) {
					case 0:
						job.promote();
						break;
					case 1:
						job.demote();
						break;
					case 2:
						job.cancel();
						break;
					case 3:
						running.values().next().value?.resolve();
						break;
					case 4:
						await main.tick();
						break;
				}
			}
			for (let i = 0; settled < jobs.length && i < 2000; i++) {
				running.values().next().value?.resolve();
				await main.tick();
			}
			assert.equal(settled, jobs.length, `stranded work at ${capacity}/${reserve}`);
			assert.equal(running.size, 0);
			queue.destroy();
			assert.equal(main.pending, 0);
		}
	}
});
