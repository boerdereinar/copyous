import Gio from 'gi://Gio';

export type FileCategory =
	'pdf' | 'spreadsheet' | 'document' | 'image' | 'audio' | 'video' | 'application' | 'archive' | 'text' | 'other';

const categories: Partial<Record<FileCategory, string[]>> = {
	pdf: ['application/pdf'],
	spreadsheet: [
		'text/csv',
		'text/tab-separated-values',
		'application/vnd.ms-excel',
		'application/vnd.oasis.opendocument.spreadsheet',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	],
	document: [
		'application/msword',
		'application/rtf',
		'application/vnd.oasis.opendocument.text',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.ms-powerpoint',
		'application/vnd.oasis.opendocument.presentation',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	],
	image: ['image/*'],
	audio: ['audio/*'],
	video: ['video/*'],
	application: ['application/vnd.android.package-archive'],
	archive: [
		'application/zip',
		'application/x-7z-compressed',
		'application/vnd.rar',
		'application/gzip',
		'application/x-tar',
	],
	text: ['text/plain'],
};

/** Classify names without reading file contents or performing filesystem I/O. */
export function getFileCategory(uri: string): FileCategory {
	const name = Gio.File.new_for_uri(uri).get_basename();
	const [contentType] = Gio.content_type_guess(name, null);
	for (const [category, types] of Object.entries(categories)) {
		if (types.some((type) => Gio.content_type_is_a(contentType, type))) return category as FileCategory;
	}
	return 'other';
}

export function getFilesCategory(uris: string[]): FileCategory {
	const first = uris[0];
	if (!first) return 'other';
	const category = getFileCategory(first);
	return uris.every((uri) => getFileCategory(uri) === category) ? category : 'other';
}
