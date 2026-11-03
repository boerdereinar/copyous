import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { ProbeResult } from '../../scripts/mediaProbeWorker.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

interface MediaProbeRequest {
	uri: string;
	resolve: (result: ProbeResult) => void;
	reject: (error: string) => void;
	cancellable?: Gio.Cancellable | undefined;
	cancellableSignalId?: number | undefined;
	completed: boolean;
}

export class MediaProbe {
	private readonly _workerPath: string;

	private readonly queue: MediaProbeRequest[] = [];
	private activeRequests: MediaProbeRequest[] = [];
	private process: Gio.Subprocess | null = null;
	private idleSourceId: number | undefined;
	private running = false;
	private scheduled = false;
	private destroyed = false;

	constructor(ext: Extension) {
		this._workerPath = GLib.build_filenamev([ext.path, 'scripts', 'mediaProbeWorker.js']);
	}

	public probe(uri: string, cancellable?: Gio.Cancellable): Promise<ProbeResult> {
		if (this.destroyed) return Promise.reject(new Error('Media probe has been destroyed'));

		return new Promise((resolve, reject) => {
			const request: MediaProbeRequest = { uri, resolve, reject, cancellable, completed: false };
			if (cancellable?.is_cancelled()) {
				this.reject(request, 'Media probe request was cancelled');
				return;
			}

			request.cancellableSignalId = cancellable?.connect(() => this.cancel(request));

			this.queue.push(request);
			this.schedule();
		});
	}

	public destroy() {
		if (this.destroyed) return;

		this.destroyed = true;
		if (this.idleSourceId !== undefined) GLib.source_remove(this.idleSourceId);
		this.idleSourceId = undefined;
		this.scheduled = false;

		for (const request of this.queue.splice(0)) this.reject(request, 'Media probe was destroyed');
		for (const request of this.activeRequests) this.reject(request, 'Media probe was destroyed');
		this.activeRequests = [];

		this.process?.force_exit();
		this.process = null;
		this.running = false;
	}

	private schedule() {
		if (this.destroyed || this.running || this.scheduled) return;

		this.scheduled = true;
		this.idleSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
			this.idleSourceId = undefined;
			this.scheduled = false;
			if (!this.destroyed) {
				void this.run();
			}

			return GLib.SOURCE_REMOVE;
		});
	}

	private async run() {
		if (this.destroyed || this.running || this.queue.length === 0) return;

		const requests = this.queue.splice(0);
		this.activeRequests = requests;
		this.running = true;
		let process: Gio.Subprocess | null = null;
		try {
			process = Gio.Subprocess.new(
				['gjs', '-m', this._workerPath, ...requests.map(({ uri }) => uri)],
				Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
			);
			this.process = process;
			const [stdout, stderr] = await process.communicate_utf8_async(null, null);
			if (!process.get_successful()) {
				throw new Error(stderr.trim() || 'Media probe worker failed');
			}

			const results = this.parseResults(stdout, requests);
			for (const [index, request] of requests.entries()) {
				this.resolve(request, results[index]!);
			}
		} catch (error) {
			for (const request of requests) this.reject(request, String(error));
		} finally {
			if (this.process === process) this.process = null;
			if (this.activeRequests === requests) this.activeRequests = [];
			this.running = false;
			this.schedule();
		}
	}

	private parseResults(stdout: string, requests: MediaProbeRequest[]): ProbeResult[] {
		let results: unknown;
		try {
			results = JSON.parse(stdout);
		} catch {
			throw new Error('Media probe worker returned invalid results');
		}

		if (!Array.isArray(results) || results.length !== requests.length) {
			throw new Error('Media probe worker returned invalid results');
		}

		const probeResults: ProbeResult[] = [];
		for (const [index, request] of requests.entries()) {
			const result: unknown = results[index];
			if (!this.isProbeResult(result) || result.uri !== request.uri) {
				throw new Error('Media probe worker returned invalid results');
			}

			probeResults.push(result);
		}

		return probeResults;
	}

	private isProbeResult(result: unknown): result is ProbeResult {
		if (typeof result !== 'object' || result === null) return false;

		const { uri, success, duration, error } = result as Partial<ProbeResult>;
		return (
			typeof uri === 'string' &&
			typeof success === 'boolean' &&
			(duration === undefined || typeof duration === 'number') &&
			(error === undefined || typeof error === 'string')
		);
	}

	private cancel(request: MediaProbeRequest) {
		const index = this.queue.indexOf(request);
		if (index !== -1) this.queue.splice(index, 1);

		this.reject(request, 'Media probe request was cancelled');
		if (this.activeRequests.length > 0 && this.activeRequests.every(({ completed }) => completed))
			this.process?.force_exit();
	}

	private resolve(request: MediaProbeRequest, result: ProbeResult) {
		if (request.completed) return;

		request.completed = true;
		this.disconnectCancellable(request);
		request.resolve(result);
	}

	private reject(request: MediaProbeRequest, error: string) {
		if (request.completed) return;

		request.completed = true;
		this.disconnectCancellable(request);
		request.reject(error);
	}

	private disconnectCancellable(request: MediaProbeRequest) {
		if (request.cancellableSignalId === undefined) return;

		request.cancellable?.disconnect(request.cancellableSignalId);
		request.cancellableSignalId = undefined;
	}
}
