import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import type { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import type { ConsoleLike, Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { ClipboardEntry } from '../database/database.js';
import { ColorSpace } from './color.js';
import { ItemType, getActionsConfigPath } from './constants.js';

export interface ActionConfig {
	actions: (Action | ActionSubmenu)[];
	defaults?: Partial<Record<ItemType, string>>;
}

export interface ActionSubmenu {
	name: string;
	actions: Action[];
}

export const ActionOutput = {
	Ignore: 'ignore',
	Copy: 'copy',
	Paste: 'paste',
} as const;

export type ActionOutput = (typeof ActionOutput)[keyof typeof ActionOutput];

export interface Action {
	kind: string;
	id: string;
	name: string;
	pattern?: string | null;
	types?: ItemType[] | null;
	output: ActionOutput;
	shortcut?: string[] | null;
}

export interface CommandAction extends Action {
	kind: 'command';
	command: string;
}

export interface ColorAction extends Action {
	kind: 'color';
	space: ColorSpace;
	types: [(typeof ItemType)['Color']];
	output: (typeof ActionOutput)['Copy'] | (typeof ActionOutput)['Paste'];
}

export interface QrCodeAction extends Action {
	kind: 'qrcode';
	output: (typeof ActionOutput)['Ignore'];
}

export function instanceofActionSubmenu(obj: object): obj is ActionSubmenu {
	return 'name' in obj && 'actions' in obj;
}

export function instanceofAction(obj: object): obj is Action {
	return 'kind' in obj && 'id' in obj && 'name' in obj && 'output' in obj;
}

export function instanceofCommandAction(obj: object): obj is CommandAction {
	return instanceofAction(obj) && obj.kind === 'command' && 'command' in obj;
}

export function instanceofColorAction(obj: object): obj is ColorAction {
	return instanceofAction(obj) && obj.kind === 'color' && 'space' in obj;
}

export function instanceofQrCodeAction(obj: object): obj is QrCodeAction {
	return instanceofAction(obj) && obj.kind === 'qrcode';
}

/**
 * Test if an action is applicable to a clipboard entry.
 * @param entry the clipboard entry to test the action against.
 * @param action the action.
 */
export function testAction(entry: ClipboardEntry, action: Action): boolean {
	const type = !action.types?.length || action.types.includes(entry.type);
	if (!type) return false;
	if (!action.pattern) return true;

	try {
		const regex = new RegExp(action.pattern);
		return regex.test(entry.content);
	} catch {
		return false;
	}
}

/**
 * Test if an action is applicable to a clipboard entry and return the matches from the regular expression.
 * @param entry the clipboard entry to test the action against.
 * @param action the action.
 * @returns an array of matches if the action matches, null otherwise.
 */
export function matchAction(entry: ClipboardEntry, action: Action): (string | undefined)[] | null {
	const type = !action.types?.length || action.types.includes(entry.type);
	if (!type) return null;
	if (!action.pattern) return [entry.content];

	try {
		const regex = new RegExp(action.pattern);
		return entry.content.match(regex);
	} catch {
		return null;
	}
}

/**
 * Find an action by its id in an action configuration.
 * @param config the action configuration.
 * @param id the id of the action.
 * @returns an action if an action with the id was found, undefined otherwise.
 */
export function findActionById(config: ActionConfig, id: string): Action | undefined {
	function findAction(actions: (Action | ActionSubmenu)[]): Action | undefined {
		for (const action of actions) {
			if (instanceofActionSubmenu(action)) {
				const result = findAction(action.actions);
				if (result) return result;
			}

			if (instanceofAction(action) && action.id === id) return action;
		}

		return undefined;
	}

	return findAction(config.actions);
}

/**
 * Check if an action is the default action for an entry.
 * @param config the action configuration.
 * @param entry the entry.
 * @param action the action.
 */
export function isDefaultAction(config: ActionConfig, entry: ClipboardEntry, action: Action): boolean {
	return config.defaults?.[entry.type] === action.id;
}

/**
 * Find the default action for an entry.
 * @param config the action configuration.
 * @param entry the entry.
 * @returns an action if a default action was found, undefined otherwise.
 */
export function findDefaultAction(config: ActionConfig, entry: ClipboardEntry): Action | undefined {
	const id = config.defaults?.[entry.type];
	return id ? findActionById(config, id) : undefined;
}

/**
 * Get the default configuration.
 * @param ext extension or extension preferences.
 */
export function defaultConfig(ext: Extension | ExtensionPreferences): ActionConfig {
	const _ = ext.gettext.bind(ext);

	function colorAction(id: string, name: string, pattern: string, space: ColorSpace): ColorAction {
		return {
			kind: 'color',
			id,
			name,
			pattern,
			types: [ItemType.Color],
			space,
			output: ActionOutput.Paste,
			shortcut: [],
		};
	}

	return {
		actions: [
			{
				name: _('Open'),
				actions: [
					{
						kind: 'command',
						id: 'open-with-default',
						name: _('Open with Default'),
						pattern: null,
						types: [ItemType.Image, ItemType.File],
						command: 'xargs xdg-open',
						output: ActionOutput.Ignore,
						shortcut: [],
					} as CommandAction,
					{
						kind: 'command',
						id: 'open-with-files',
						name: _('Open with Files'),
						pattern: '^(.*)',
						types: [ItemType.Image, ItemType.File, ItemType.Files],
						command: 'nautilus -s $1',
						output: ActionOutput.Ignore,
						shortcut: [],
					} as CommandAction,
					{
						kind: 'command',
						id: 'open-with-browser',
						name: _('Open with Browser'),
						pattern: null,
						types: [ItemType.Link],
						command: 'xargs xdg-open',
						output: ActionOutput.Ignore,
						shortcut: [],
					} as CommandAction,
				],
			},
			{
				kind: 'command',
				id: 'paste-as-path',
				name: _('Paste as Path'),
				pattern: null,
				types: [ItemType.Image, ItemType.File, ItemType.Files],
				command: 'cut -c8-',
				output: ActionOutput.Paste,
				shortcut: [],
			} as CommandAction,
			{
				name: _('Convert'),
				actions: [
					colorAction('rgb', _('Rgb'), `^(?!rgb)`, ColorSpace.Rgb),
					colorAction('hex', _('Hex'), `^(?!#)`, ColorSpace.Hex),
					colorAction('hsl', _('Hsl'), `^(?!hsl)`, ColorSpace.Hsl),
					// colorAction('hwb', _('Hwb'), `^(?!hwb)`, ColorSpace.Hwb),
					// colorAction('linear-rgb', _('Linear Rgb'), `^(?!color\\(srgb-linear)`, ColorSpace.LinearRgb),
					// colorAction('xyz', _('Xyz'), `^(?!color\\(xyz)`, ColorSpace.Xyz),
					// colorAction('lab', _('Lab'), `^(?!lab)`, ColorSpace.Lab),
					// colorAction('lch', _('Lch'), `^(?!lch)`, ColorSpace.Lch),
					// colorAction('oklab', _('Oklab'), `^(?!oklab)`, ColorSpace.Oklab),
					colorAction('oklch', _('Oklch'), `^(?!oklch)`, ColorSpace.Oklch),
				],
			},
			{
				kind: 'qrcode',
				id: 'qrcode',
				name: _('QR Code'),
				pattern: null,
				types: [ItemType.Text, ItemType.Code, ItemType.Link, ItemType.Character, ItemType.Color],
				output: ActionOutput.Ignore,
				shortcut: ['<Control>q'],
			} as QrCodeAction,
		],
		defaults: {
			[ItemType.File]: 'paste-as-path',
			[ItemType.Files]: 'paste-as-path',
			[ItemType.Link]: 'open-with-browser',
		},
	};
}

/**
 * Load the configuration.
 * @param ext the extension or extension preferences.
 * @param save whether to save a default configuration if no configuration was found.
 */
export function loadConfig(ext: Extension | ExtensionPreferences, save: boolean = false): ActionConfig {
	const environment = GLib.get_environ();
	const actions = GLib.environ_getenv(environment, 'DEBUG_COPYOUS_ACTIONS');
	if (actions === 'default') return defaultConfig(ext);

	const path = actions ? Gio.File.new_for_path(actions) : getActionsConfigPath(ext);
	try {
		if (path.query_exists(null)) {
			const [success, contents, _etag] = path.load_contents(null);
			if (success) {
				const text = new TextDecoder().decode(contents);
				return JSON.parse(text) as ActionConfig;
			}
		} else {
			const config = defaultConfig(ext);
			if (save) saveConfig(ext, config);
			return config;
		}
	} catch (err) {
		const logger = 'logger' in ext ? (ext.logger as ConsoleLike) : ext.getLogger();
		logger.error('Failed to load actions config', err);
	}

	return defaultConfig(ext);
}

/**
 * Save the configuration.
 * @param ext the extension or extension preferences.
 * @param config the configuration to save.
 * @param backup whether to back up the previous preferences.
 */
export function saveConfig(ext: Extension | ExtensionPreferences, config: ActionConfig, backup: boolean = false): void {
	const path = getActionsConfigPath(ext);
	const dir = path.get_parent()!;
	if (!dir.query_exists(null)) {
		dir.make_directory_with_parents(null);
	}

	path.replace_contents(
		JSON.stringify(config, null, '\t'),
		null,
		backup,
		Gio.FileCreateFlags.REPLACE_DESTINATION,
		null,
	);
}

/**
 * Get all ids in actions.
 * @param actions the actions to iterate.
 */
function* getIds(actions: (Action | ActionSubmenu)[]): Iterable<string> {
	for (const action of actions) {
		if (instanceofActionSubmenu(action)) {
			yield* getIds(action.actions);
		} else if (instanceofAction(action)) {
			yield action.id;
		}
	}
}

/**
 * Count the number of action ids that occur in config2 but not in config1.
 * @param config1 the original configuration.
 * @param config2 the configuration to check.
 */
export function countDifference(config1: ActionConfig, config2: ActionConfig): number {
	const ids1 = new Set(getIds(config1.actions));

	let count = 0;
	for (const id of getIds(config2.actions)) {
		if (!ids1.has(id)) count++;
	}

	return count;
}

/**
 * Merge all actions from config2 into config1 such.
 * @param config1 the original configuration.
 * @param config2 the configuration to merge into config1.
 */
export function mergeConfig(config1: ActionConfig, config2: ActionConfig): ActionConfig {
	function* filterActions(actions: (Action | ActionSubmenu)[]): Iterable<Action | ActionSubmenu> {
		for (const action of actions) {
			if (instanceofActionSubmenu(action)) {
				const a = Array.from(filterActions(action.actions)) as Action[];
				if (a.length > 0) {
					yield {
						name: action.name,
						actions: a,
					};
				}
			} else if (instanceofAction(action)) {
				if (!ids.has(action.id)) {
					yield action;
				}
			}
		}
	}

	const ids = new Set(getIds(config1.actions));
	let filtered = Array.from(filterActions(config2.actions));

	// Group submenus in config2 with the first occurrence of the submenu in config1
	const actions = [];
	for (const action of config1.actions) {
		if (instanceofActionSubmenu(action)) {
			const indexes = new Set();
			const submenus = filtered.filter((x, i) => {
				const pred = instanceofActionSubmenu(x) && x.name === action.name;
				if (pred) indexes.add(i);
				return pred;
			}) as ActionSubmenu[];
			const submenuActions = submenus.flatMap((x) => x.actions);

			if (submenuActions.length > 0) {
				const submenu = {
					name: action.name,
					actions: [...action.actions, ...submenuActions],
				};
				actions.push(submenu);
				filtered = filtered.filter((_, i) => !indexes.has(i));
			} else {
				actions.push(action);
			}
		} else if (instanceofAction(action)) {
			actions.push(action);
		}
	}

	return {
		actions: [...actions, ...filtered],
		defaults: config1.defaults ?? {},
	};
}
