import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const probe = spawnSync('gjs', ['-c', "imports.gi.versions.Soup = '3.0'; imports.gi.Soup;"], { timeout: 5000 });
test(
	'native Soup requests load metadata and cache link images; cancellation stays silent',
	{
		skip: probe.status !== 0 ? 'GJS and Soup 3 are not installed' : false,
	},
	async () => {
		const image = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
			'base64',
		);
		let imageRequests = 0;
		const server = createServer((request, response) => {
			if (request.url === '/image.png') {
				imageRequests++;
				response.writeHead(200, { 'Content-Type': 'image/png' });
				response.end(image);
			} else {
				response.writeHead(200, { 'Content-Type': 'text/html' });
				response.end(
					'<title>Sample &amp; title</title><meta name="description" content="Description"><meta property="og:image" content="/image.png">',
				);
			}
		});
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const port = server.address().port;
		const directory = mkdtempSync(join(tmpdir(), 'copyous-link-test-'));
		try {
			const source = readFileSync(new URL('../../src/lib/misc/link.ts', import.meta.url), 'utf8');
			const ast = ts.createSourceFile('link.ts', source, ts.ScriptTarget.Latest, true);
			const selected = ast.statements.filter(
				(node) =>
					ts.isFunctionDeclaration(node) ||
					(ts.isExpressionStatement(node) && node.getText(ast).startsWith('Gio._promisify(')),
			);
			const { outputText } = ts.transpileModule(selected.map((node) => node.getText(ast)).join('\n'), {
				compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
			});
			const runner = join(directory, 'native.mjs');
			writeFileSync(
				runner,
				`
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';
import System from 'system';
const exports = {};
const OutputStreamSpliceFlags = Gio.OutputStreamSpliceFlags;
const UserAgent = 'Copyous regression test';
const getCachePath = () => Gio.File.new_for_path(${JSON.stringify(directory)});
${outputText}
function check(condition, message) { if (!condition) throw new Error(message); }
async function main() {
    const base = 'http://127.0.0.1:${port}';
    const errors = [];
    const ext = { logger: { error: (...args) => errors.push(args) } };
    const metadata = await tryGetMetadata(ext, base + '/', new Gio.Cancellable());
    check(metadata.title === 'Sample & title' && metadata.description === 'Description', 'metadata mismatch');
    check(metadata.image === base + '/image.png', 'relative image URL mismatch');
    const image = await tryGetLinkImage(ext, metadata.image, new Gio.Cancellable());
    check(image && image.query_exists(null), 'link image was not cached');
    const again = await tryGetLinkImage(ext, metadata.image, new Gio.Cancellable());
    check(again && again.equal(image), 'cache was not reused');
    const token = new Gio.Cancellable(); token.cancel();
    await tryGetMetadata(ext, base + '/cancelled', token);
    check(errors.length === 0, 'cancellation produced errors: ' + JSON.stringify(errors));
}
const loop = new GLib.MainLoop(null, false);
main().then(() => loop.quit(), (error) => { printerr(error.stack ?? String(error)); System.exit(1); });
loop.run();
`,
			);
			await new Promise((resolve, reject) => {
				const child = spawn('gjs', ['-m', runner], { timeout: 20000 });
				let output = '';
				child.stdout.on('data', (data) => {
					output += data;
				});
				child.stderr.on('data', (data) => {
					output += data;
				});
				child.once('error', reject);
				child.once('close', (code) => {
					if (code === 0) resolve();
					else reject(new Error(`GJS exited ${code}: ${output}`));
				});
			});
			assert.equal(imageRequests, 1, 'cached images must not be downloaded twice');
		} finally {
			rmSync(directory, { recursive: true, force: true });
			await new Promise((resolve) => server.close(resolve));
		}
	},
);
