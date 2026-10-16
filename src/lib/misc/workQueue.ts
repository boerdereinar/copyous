/** Schedule one callback on a later main-loop turn; return its cancellation function. */
export type ScheduleWork = (callback: () => void) => () => void;

export interface QueuedWork<T> {
	readonly promise: Promise<T | undefined>;
	/** Cancel pending work; running I/O needs its own cancellation and retains its slot until settled. */
	cancel(): void;
	promote(): void;
	demote(): void;
}

interface Job {
	start(): void;
	cancel(this: void): void;
}

/** Bounded asynchronous work with O(1) cancellation and foreground promotion. */
export class WorkQueue {
	private readonly foreground = new Set<Job>();
	private readonly background = new Set<Job>();
	private active = 0;
	private cancelScheduled: (() => void) | null = null;
	private disposed = false;

	constructor(
		private readonly schedule: ScheduleWork,
		private readonly concurrency: number,
		private readonly foregroundReserve = 0,
	) {
		if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid concurrency');
		if (!Number.isInteger(foregroundReserve) || foregroundReserve < 0 || foregroundReserve >= concurrency)
			throw new Error('Invalid foreground reserve');
	}

	public add<T>(work: () => T | Promise<T>): QueuedWork<T> {
		let pending = true;
		let resolve!: (value: T | undefined) => void;
		let reject!: (reason: unknown) => void;
		const promise = new Promise<T | undefined>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		const job: Job = {
			start: () => {
				pending = false;
				this.active++;
				// Keep synchronous throws inside the promise and release the slot on either outcome.
				void Promise.resolve()
					.then(() => (this.disposed ? undefined : work()))
					.then(resolve, reject)
					.finally(() => {
						this.active--;
						this.scheduleNext();
					});
			},
			cancel: () => {
				if (!pending) return;
				pending = false;
				this.foreground.delete(job);
				this.background.delete(job);
				resolve(undefined);
			},
		};
		if (this.disposed) job.cancel();
		else {
			this.background.add(job);
			this.scheduleNext();
		}
		return {
			promise,
			cancel: job.cancel,
			demote: () => {
				if (pending && this.foreground.delete(job)) this.background.add(job);
			},
			promote: () => {
				if (pending && this.background.delete(job)) {
					this.foreground.add(job);
					this.scheduleNext();
				}
			},
		};
	}

	private scheduleNext(): void {
		if (this.disposed || this.cancelScheduled || this.active >= this.concurrency) return;
		if (this.foreground.size + this.background.size === 0) return;
		if (!this.foreground.size && this.active >= this.concurrency - this.foregroundReserve) return;
		this.cancelScheduled = this.schedule(() => {
			this.cancelScheduled = null;
			if (!this.foreground.size && this.active >= this.concurrency - this.foregroundReserve) return;
			const queue = this.foreground.size ? this.foreground : this.background;
			const job = queue.values().next().value;
			if (job) {
				queue.delete(job);
				job.start();
			}
			// Start at most one job per turn so synchronous setup cannot form one long burst.
			this.scheduleNext();
		});
	}

	public destroy(): void {
		this.disposed = true;
		this.cancelScheduled?.();
		this.cancelScheduled = null;
		for (const job of this.foreground) job.cancel();
		for (const job of this.background) job.cancel();
	}
}

/** Construct hidden history in short slices. The clock returns microseconds; flush completes the full list. */
export class IdleBatch<T> {
	private entries: readonly T[] | null = null;
	private index = 0;
	private generation = 0;
	private cancelScheduled: (() => void) | null = null;

	constructor(
		private readonly schedule: ScheduleWork,
		private readonly now: () => number,
		private readonly consume: (entry: T) => void,
	) {}

	public replace(entries: readonly T[]): void {
		this.clear();
		this.entries = entries;
		this.scheduleNext();
	}

	private scheduleNext(): void {
		if (!this.entries || this.cancelScheduled) return;
		this.cancelScheduled = this.schedule(() => {
			this.cancelScheduled = null;
			const generation = this.generation;
			const deadline = this.now() + 4000;
			let count = 0;
			try {
				while (this.entries && this.index < this.entries.length && generation === this.generation) {
					this.consume(this.entries[this.index++]!);
					if (++count >= 32 || this.now() >= deadline) break;
				}
			} finally {
				this.continueBatch(generation);
			}
		});
	}

	public flush(): void {
		this.cancelScheduled?.();
		this.cancelScheduled = null;
		const generation = this.generation;
		try {
			while (this.entries && this.index < this.entries.length && generation === this.generation)
				this.consume(this.entries[this.index++]!);
		} finally {
			this.continueBatch(generation);
		}
	}

	private continueBatch(generation: number): void {
		if (generation !== this.generation) return;
		if (this.entries && this.index === this.entries.length) this.clear();
		else this.scheduleNext();
	}

	public clear(): void {
		this.generation++;
		this.cancelScheduled?.();
		this.cancelScheduled = null;
		this.entries = null;
		this.index = 0;
	}
}
