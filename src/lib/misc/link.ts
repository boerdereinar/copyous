import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../extension.js';
import { UserAgent, getCachePath } from '../common/constants.js';
import { LinkMetadata } from '../database/database.js';

import OutputStreamSpliceFlags = Gio.OutputStreamSpliceFlags;

Gio._promisify(Soup.Session.prototype, 'send_async');
Gio._promisify(Gio.File.prototype, 'replace_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.OutputStream.prototype, 'splice_async');

export async function tryGetMetadata(
	ext: CopyousExtension,
	url: string,
	cancellable: Gio.Cancellable,
): Promise<LinkMetadata> {
	const empty: LinkMetadata = { title: null, description: null, image: null };

	let session: Soup.Session | null = null;
	try {
		// Check if URL is valid
		const uri = GLib.uri_parse(url, GLib.UriFlags.NONE);

		// Create request
		session = new Soup.Session({ user_agent: UserAgent, idle_timeout: 5 });
		const message = Soup.Message.new_from_uri('GET', uri);
		// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept
		message.request_headers.append('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');

		// Send request
		const response = await session.send_async(message, GLib.PRIORITY_DEFAULT, cancellable);
		if (response == null) return empty;

		// Check if the response is an image
		const [contentType] = message.response_headers.get_content_type();
		if (contentType && Gio.content_type_is_a(contentType, 'image/*')) {
			// Since the response has already been received, write image to cache
			const imagePath = getLinkImagePath(ext, url);
			if (imagePath == null) return empty;

			// Write to cache
			if (!imagePath.query_exists(cancellable)) {
				const out = await imagePath.replace_async(
					null,
					false,
					Gio.FileCreateFlags.REPLACE_DESTINATION,
					GLib.PRIORITY_DEFAULT,
					null,
				);
				await out.splice_async(
					response,
					Gio.OutputStreamSpliceFlags.CLOSE_SOURCE | Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
					GLib.PRIORITY_DEFAULT,
					null,
				);
			}

			return { title: null, description: null, image: url };
		}

		// Download page
		if (!contentType || !Gio.content_type_is_a(contentType, 'text/html')) return empty;

		const out = Gio.MemoryOutputStream.new_resizable();
		await out.splice_async(
			response,
			OutputStreamSpliceFlags.CLOSE_SOURCE | Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
			GLib.PRIORITY_DEFAULT,
			cancellable,
		);

		const bytes = out.steal_as_bytes();
		const data = bytes.get_data();
		if (data == null) return empty;

		// Extract metadata
		const text = new TextDecoder().decode(data);

		// This regex is enough for most cases without having to resort to using a HTML parser
		const metaRegex = /<meta\s+(?:property|name)="([^"]*?)"\s+content="([^"]*?)"/gm;
		const reverseMetaRegex = /<meta\s+content="([^"]*?)"\s+(?:property|name)="([^"]*?)"/gm;
		const meta: Record<string, string> = {};
		for (const match of text.matchAll(metaRegex)) meta[match[1]!] = match[2]!;
		for (const match of text.matchAll(reverseMetaRegex)) meta[match[2]!] = match[1]!;

		// Title
		let title = meta['title'] ?? meta['og:title'] ?? meta['twitter:title'] ?? null;
		if (title == null) {
			const titleRegex = /<title>\s*(.*?)\s*<\/title>/s;
			const titleMatch = text.match(titleRegex);
			title = titleMatch ? titleMatch[1]! : null;
		}

		// Description
		let description = meta['description'] ?? meta['og:description'] ?? meta['twitter:description'] ?? null;

		// Image
		let image =
			meta['image'] ??
			meta['og:image'] ??
			meta['og:image:url'] ??
			meta['og:image:secure_url'] ??
			meta['twitter:image'] ??
			null;
		if (image) {
			try {
				// Resolve relative image paths
				image = uri.parse_relative(image, GLib.UriFlags.NONE).to_string();
			} catch {
				image = null;
			}
		}

		// Escape
		title = title ? decodeHtml(title).trim() : null;
		description = description ? decodeHtml(description).trim() : null;

		return { title: title, description: description, image: image };
	} catch (err) {
		ext.logger.error('Failed to get metadata', err);
	} finally {
		session?.abort();
	}

	return empty;
}

function decodeHtml(html: string): string {
	return html
		.replace(/&amp;/g, '&') // Pre-check for `&amp;` to fix wrong encoding on many websites
		.replace(/&([^;]+);/g, (_, s: string) => {
			switch (s) {
				case 'lt':
					return '<';
				case 'gt':
					return '>';
				case 'amp':
					return '&';
				case 'quot':
					return '"';
				case 'apos':
					return "'";
				case 'mdash':
					return '—';
				case 'ndash':
					return '–';
				default:
					return '';
			}
		})
		.replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(+n));
}

export function getLinkImagePath(ext: Extension, url: string): Gio.File | null {
	const checksum = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, url.length);
	if (checksum == null) return null;

	const cacheDir = getCachePath(ext);
	if (!cacheDir.query_exists(null)) cacheDir.make_directory_with_parents(null);

	return cacheDir.get_child(checksum);
}

export async function tryGetLinkImage(
	ext: CopyousExtension,
	url: string,
	cancellable: Gio.Cancellable,
): Promise<Gio.File | null> {
	let session: Soup.Session | null = null;
	try {
		// Check if URL is valid
		const uri = GLib.uri_parse(url, GLib.UriFlags.NONE);

		// Check if image is already cached
		const imagePath = getLinkImagePath(ext, url);
		if (imagePath == null) return null;
		if (imagePath.query_exists(cancellable)) return imagePath;

		// Otherwise download image
		session = new Soup.Session({ user_agent: UserAgent, idle_timeout: 5 });
		const message = Soup.Message.new_from_uri('GET', uri);
		// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept
		message.request_headers.append(
			'Accept',
			'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
		);

		// Send request
		const response = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
		if (response == null) return null;

		const data = response.get_data();
		if (data == null) return null;

		// Check if the response is an image
		const [contentType] = message.response_headers.get_content_type();
		if (contentType == null || !contentType.startsWith('image/')) return null;

		// Write to cache
		await imagePath.replace_contents_async(data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, cancellable);
		return imagePath;
	} catch {
		ext.logger.error('Failed to get link image');
	} finally {
		session?.abort();
	}

	return null;
}
