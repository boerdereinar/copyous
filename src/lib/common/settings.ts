import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

export function bind_enum(settings: Gio.Settings, key: string, object: GObject.Object, property: string): void {
	object.set_property(property, settings.get_enum(key));

	settings.connect(`changed::${key}`, () => object.set_property(property, settings.get_enum(key)));
	object.connect(`notify::${property}`, () => {
		const value = (object as unknown as Record<string, number>)[property];
		if (value != null) settings.set_enum(key, value);
	});
}

export function bind_flags(settings: Gio.Settings, key: string, object: GObject.Object, property: string): void {
	object.set_property(property, settings.get_flags(key));

	settings.connect(`changed::${key}`, () => object.set_property(property, settings.get_flags(key)));
	object.connect(`notify::${property}`, () => {
		const value = (object as unknown as Record<string, number>)[property];
		if (value != null) settings.set_flags(key, value);
	});
}

export function migrateSettings(settings: Gio.Settings): void {
	// inverted paste-on-copy -> swap-copy-shortcut
	const pasteOnCopy = settings.get_user_value<'b'>('paste-on-copy');
	if (pasteOnCopy !== null) settings.set_boolean('swap-copy-shortcut', !pasteOnCopy.get_boolean());
	settings.reset('paste-on-copy');
}
