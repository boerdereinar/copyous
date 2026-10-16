import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const probe = spawnSync('gjs', ['-c', 'imports.gi.GdkPixbuf; imports.gi.Gio;'], { timeout: 5000 });
test(
	'native GIO/GdkPixbuf scaling writes a valid PNG and cancellation never publishes a partial image',
	{
		skip: probe.status !== 0 ? 'GJS and GdkPixbuf are not installed' : false,
	},
	() => {
		const source = readFileSync(new URL('../../src/lib/ui/components/contentPreview.ts', import.meta.url), 'utf8');
		const ast = ts.createSourceFile('contentPreview.ts', source, ts.ScriptTarget.Latest, true);
		const names = new Set(['ensureDirectory', 'getScaledPreviewFile', 'getSafePreviewFile', 'fileExists']);
		const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
		assert.equal(functions.length, names.size);
		const { outputText } = ts.transpileModule(functions.map((node) => node.getText(ast)).join('\n'), {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		});
		const directory = mkdtempSync(join(tmpdir(), 'copyous-image-test-'));
		try {
			const runner = join(directory, 'native.mjs');
			writeFileSync(
				runner,
				`
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import System from 'system';
const exports = {};
const MAX_PREVIEW_EDGE = 4096;
const PREVIEW_TARGET_EDGE = 1024;
const root = Gio.File.new_for_path(${JSON.stringify(directory)});
const getCachePath = () => root.get_child('cache');
for (const method of ['query_info_async', 'make_directory_async', 'read_async', 'replace_contents_async'])
    Gio._promisify(Gio.File.prototype, method);
Gio._promisify(Gio.InputStream.prototype, 'close_async');
Gio._promisify(Gio.OutputStream.prototype, 'close_async');
${outputText}
function check(condition, message) { if (!condition) throw new Error(message); }
function cached(file) {
    const uri = file.get_uri();
    const key = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, uri, uri.length);
    return getCachePath().get_child('previews').get_child(key + '.png');
}
async function main() {
    const image = root.get_child('large.png');
    const pixbuf = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, 5000, 32);
    pixbuf.fill(0x3f82baff);
    pixbuf.savev(image.get_path(), 'png', [], []);
    const result = await getSafePreviewFile({}, image, 5000, 32, new Gio.Cancellable());
    const [format, width, height] = GdkPixbuf.Pixbuf.get_file_info(result.get_path());
    check(format && width === 1024 && height === 7, 'invalid downscaled image');
    const again = await getSafePreviewFile({}, image, 5000, 32, new Gio.Cancellable());
    check(again.equal(result), 'cached preview not reused');
    const cancelled = root.get_child('cancelled.png');
    const token = new Gio.Cancellable();
    token.cancel();
    let rejected = false;
    try { await getSafePreviewFile({}, cancelled, 5000, 32, token); }
    catch (error) { rejected = error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED); }
    check(rejected, 'cancellation did not propagate');
    check(!cached(cancelled).query_exists(null), 'cancelled work published a preview');
    const broken = root.get_child('broken.png');
    await broken.replace_contents_async(new TextEncoder().encode('invalid image'), null, false, Gio.FileCreateFlags.NONE, null);
    rejected = false;
    try { await getSafePreviewFile({}, broken, 5000, 32, new Gio.Cancellable()); }
    catch { rejected = true; }
    check(rejected && !cached(broken).query_exists(null), 'failed work published a preview');
}
const loop = new GLib.MainLoop(null, false);
main().then(() => { print('native image checks passed'); loop.quit(); }, (error) => {
    printerr(error.stack ?? String(error));
    System.exit(1);
});
loop.run();
`,
			);
			const result = spawnSync('gjs', ['-m', runner], { encoding: 'utf8', timeout: 20000 });
			assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	},
);
