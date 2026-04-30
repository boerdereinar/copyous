import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

export const Settings = {
	Incognito: 'incognito',
	DisableGdaWarning: 'disable-gda-warning',
	DisableHljsDialog: 'disable-hljs-dialog',

	InMemoryDatabase: 'in-memory-database',
	DatabaseBackend: 'database-backend',
	DatabaseLocation: 'database-location',
	ClipboardHistory: 'clipboard-history',
	HistoryLength: 'history-length',
	HistoryTime: 'history-time',

	RememberSearch: 'remember-search',
	ExcludePinned: 'exclude-pinned',
	ExcludeTagged: 'exclude-tagged',
	ProtectPinned: 'protect-pinned',
	ProtectTagged: 'protect-tagged',
	PasteOnCopy: 'paste-on-copy',
	SyncPrimary: 'sync-primary',
	UpdateDateOnCopy: 'update-date-on-copy',

	IndicatorDisplay: 'indicator-display',
	ShowIndicator: 'show-indicator',
	ShowContentIndicator: 'show-content-indicator',
	WiggleIndicator: 'wiggle-indicator',
	SendNotification: 'send-notification',
	Sound: 'sound',
	Volume: 'volume',

	WmclassExclusions: 'wmclass-exclusions',

	ShowAtPointer: 'show-at-pointer',
	ShowAtCursor: 'show-at-cursor',
	ClipboardOrientation: 'clipboard-orientation',
	ClipboardPositionVertical: 'clipboard-position-vertical',
	ClipboardPositionHorizontal: 'clipboard-position-horizontal',
	ClipboardSize: 'clipboard-size',

	ClipboardMarginTop: 'clipboard-margin-top',
	ClipboardMarginRight: 'clipboard-margin-right',
	ClipboardMarginBottom: 'clipboard-margin-bottom',
	ClipboardMarginLeft: 'clipboard-margin-left',

	AutoHideSearch: 'auto-hide-search',
	ShowScrollbar: 'show-scrollbar',

	ItemWidth: 'item-width',
	ItemHeight: 'item-height',
	DynamicItemHeight: 'dynamic-item-height',
	TabWidth: 'tab-width',

	ShowHeader: 'show-header',
	HeaderControlsVisibility: 'header-controls-visibility',
	ShowItemTitle: 'show-item-title',

	TextItem: {
		ShowTextInfo: 'show-text-info',
		TextCountMode: 'text-count-mode',
	},

	CodeItem: {
		SyntaxHighlighting: 'syntax-highlighting',
		ShowLineNumbers: 'show-line-numbers',
		ShowCodeInfo: 'show-code-info',
		TextCountMode: 'text-count-mode',
	},

	ImageItem: {
		ShowImageInfo: 'show-image-info',
		BackgroundSize: 'background-size',
	},

	FileItem: {
		FilePreviewVisibility: 'file-preview-visibility',
		FilePreviewTypes: 'file-preview-types',
		FilePreviewExclusionPatterns: 'file-preview-exclusion-patterns',
		BackgroundSize: 'background-size',
		SyntaxHighlighting: 'syntax-highlighting',
		ShowLineNumbers: 'show-line-numbers',
	},

	LinkItem: {
		ShowLinkPreview: 'show-link-preview',
		ShowLinkPreviewImage: 'show-link-preview-image',
		LinkPreviewImageBackgroundSize: 'link-preview-image-background-size',
		LinkPreviewOrientation: 'link-preview-orientation',
		LinkPreviewExclusionPatterns: 'link-preview-exclusion-patterns',
	},

	CharacterItem: {
		MaxCharacters: 'max-characters',
		ShowUnicode: 'show-unicode',
	},

	Theme: {
		Theme: 'theme',
		ColorScheme: 'color-scheme',
		CustomColorScheme: 'custom-color-scheme',
		CustomBgColor: 'custom-bg-color',
		CustomFgColor: 'custom-fg-color',
		CustomCardBgColor: 'custom-card-bg-color',
		CustomSearchBgColor: 'custom-search-bg-color',
	},

	OpenClipboardDialogShortcut: 'open-clipboard-dialog-shortcut',
	ToggleIncognitoModeShortcut: 'toggle-incognito-mode-shortcut',
	OpenClipboardDialogBehavior: 'open-clipboard-dialog-behavior',

	PinItemShortcut: 'pin-item-shortcut',
	DeleteItemShortcut: 'delete-item-shortcut',
	EditItemShortcut: 'edit-item-shortcut',
	EditTitleShortcut: 'edit-title-shortcut',
	OpenMenuShortcut: 'open-menu-shortcut',

	MiddleClickAction: 'middle-click-action',
	SwapCopyShortcut: 'swap-copy-shortcut',
	SwapScrollShortcut: 'swap-scroll-shortcut',
} as const;

export const ChildKeys = {
	TextItem: 'text-item',
	CodeItem: 'code-item',
	ImageItem: 'image-item',
	FileItem: 'file-item',
	LinkItem: 'link-item',
	CharacterItem: 'character-item',
	Theme: 'theme',
} as const;

export type ValueTypes = 'boolean' | 'double' | 'enum' | 'flags' | 'int' | 'string' | 'strv';

export const SettingsTypes = {
	[Settings.Incognito]: 'boolean',
	[Settings.DisableGdaWarning]: 'boolean',
	[Settings.DisableHljsDialog]: 'boolean',

	[Settings.InMemoryDatabase]: 'boolean', // deprecated
	[Settings.DatabaseBackend]: 'enum',
	[Settings.DatabaseLocation]: 'string',
	[Settings.ClipboardHistory]: 'enum',
	[Settings.HistoryLength]: 'int',
	[Settings.HistoryTime]: 'int',

	[Settings.RememberSearch]: 'boolean',
	[Settings.ExcludePinned]: 'boolean',
	[Settings.ExcludeTagged]: 'boolean',
	[Settings.ProtectPinned]: 'boolean',
	[Settings.ProtectTagged]: 'boolean',
	[Settings.PasteOnCopy]: 'boolean', // deprecated
	[Settings.SyncPrimary]: 'boolean',
	[Settings.UpdateDateOnCopy]: 'boolean',

	[Settings.IndicatorDisplay]: 'enum',
	[Settings.ShowIndicator]: 'boolean', // deprecated
	[Settings.ShowContentIndicator]: 'boolean', // deprecated
	[Settings.WiggleIndicator]: 'boolean',
	[Settings.SendNotification]: 'boolean',
	[Settings.Sound]: 'string',
	[Settings.Volume]: 'double',

	[Settings.WmclassExclusions]: 'strv',

	[Settings.ShowAtPointer]: 'boolean',
	[Settings.ShowAtCursor]: 'boolean',
	[Settings.ClipboardOrientation]: 'enum',
	[Settings.ClipboardPositionVertical]: 'enum',
	[Settings.ClipboardPositionHorizontal]: 'enum',
	[Settings.ClipboardSize]: 'int',

	[Settings.ClipboardMarginTop]: 'int',
	[Settings.ClipboardMarginRight]: 'int',
	[Settings.ClipboardMarginBottom]: 'int',
	[Settings.ClipboardMarginLeft]: 'int',

	[Settings.AutoHideSearch]: 'boolean',
	[Settings.ShowScrollbar]: 'boolean',

	[Settings.ItemWidth]: 'int',
	[Settings.ItemHeight]: 'int',
	[Settings.DynamicItemHeight]: 'boolean',
	[Settings.TabWidth]: 'int',

	[Settings.ShowHeader]: 'boolean',
	[Settings.HeaderControlsVisibility]: 'enum',
	[Settings.ShowItemTitle]: 'boolean',

	[Settings.OpenClipboardDialogShortcut]: 'strv',
	[Settings.ToggleIncognitoModeShortcut]: 'strv',
	[Settings.OpenClipboardDialogBehavior]: 'enum',

	[Settings.PinItemShortcut]: 'strv',
	[Settings.DeleteItemShortcut]: 'strv',
	[Settings.EditItemShortcut]: 'strv',
	[Settings.EditTitleShortcut]: 'strv',
	[Settings.OpenMenuShortcut]: 'strv',

	[Settings.MiddleClickAction]: 'enum',
	[Settings.SwapCopyShortcut]: 'boolean',
	[Settings.SwapScrollShortcut]: 'boolean',

	[ChildKeys.TextItem]: {
		[Settings.TextItem.ShowTextInfo]: 'boolean',
		[Settings.TextItem.TextCountMode]: 'enum',
	},

	[ChildKeys.CodeItem]: {
		[Settings.CodeItem.SyntaxHighlighting]: 'boolean',
		[Settings.CodeItem.ShowLineNumbers]: 'boolean',
		[Settings.CodeItem.ShowCodeInfo]: 'boolean',
		[Settings.CodeItem.TextCountMode]: 'enum',
	},

	[ChildKeys.ImageItem]: {
		[Settings.ImageItem.ShowImageInfo]: 'boolean',
		[Settings.ImageItem.BackgroundSize]: 'enum',
	},

	[ChildKeys.FileItem]: {
		[Settings.FileItem.FilePreviewVisibility]: 'enum',
		[Settings.FileItem.FilePreviewTypes]: 'flags',
		[Settings.FileItem.FilePreviewExclusionPatterns]: 'strv',
		[Settings.FileItem.BackgroundSize]: 'enum',
		[Settings.FileItem.SyntaxHighlighting]: 'boolean',
		[Settings.FileItem.ShowLineNumbers]: 'boolean',
	},

	[ChildKeys.LinkItem]: {
		[Settings.LinkItem.ShowLinkPreview]: 'boolean',
		[Settings.LinkItem.ShowLinkPreviewImage]: 'boolean',
		[Settings.LinkItem.LinkPreviewImageBackgroundSize]: 'enum',
		[Settings.LinkItem.LinkPreviewOrientation]: 'enum',
		[Settings.LinkItem.LinkPreviewExclusionPatterns]: 'strv',
	},

	[ChildKeys.CharacterItem]: {
		[Settings.CharacterItem.MaxCharacters]: 'int',
		[Settings.CharacterItem.ShowUnicode]: 'boolean',
	},

	[ChildKeys.Theme]: {
		[Settings.Theme.Theme]: 'enum',
		[Settings.Theme.ColorScheme]: 'enum',
		[Settings.Theme.CustomColorScheme]: 'enum',
		[Settings.Theme.CustomBgColor]: 'string',
		[Settings.Theme.CustomFgColor]: 'string',
		[Settings.Theme.CustomCardBgColor]: 'string',
		[Settings.Theme.CustomSearchBgColor]: 'string',
	},
} as const;

export const DatabaseBackend = {
	Default: 0,
	Memory: 1,
	Sqlite: 2,
	Json: 3,
};

export type DatabaseBackend = (typeof DatabaseBackend)[keyof typeof DatabaseBackend];

export const ClipboardHistory = {
	Clear: 0,
	KeepPinnedAndTagged: 1,
	KeepAll: 2,
} as const;

export type ClipboardHistory = (typeof ClipboardHistory)[keyof typeof ClipboardHistory];

export const Orientation = {
	Horizontal: 0,
	Vertical: 1,
} as const;

export type Orientation = (typeof Orientation)[keyof typeof Orientation];

export const Position = {
	Top: 0,
	Left: 0,
	Center: 1,
	Bottom: 2,
	Right: 2,
	Fill: 3,
} as const;

export type Position = (typeof Position)[keyof typeof Position];

export const HeaderControlsVisibility = {
	Visible: 0,
	VisibleOnHover: 1,
	Hidden: 2,
} as const;

export type HeaderControlsVisibility = (typeof HeaderControlsVisibility)[keyof typeof HeaderControlsVisibility];

export const TextCountMode = {
	Characters: 0,
	Words: 1,
	Lines: 2,
} as const;

export type TextCountMode = (typeof TextCountMode)[keyof typeof TextCountMode];

export const BackgroundSize = {
	Cover: 0,
	Contain: 1,
} as const;

export type BackgroundSize = (typeof BackgroundSize)[keyof typeof BackgroundSize];

export const FilePreviewVisibility = {
	FilePreviewOnly: 0,
	FileInfoOnly: 1,
	FilePreviewOrFileInfo: 2,
	FilePreviewAndFileInfo: 3,
	Hidden: 4,
} as const;

export type FilePreviewVisibility = (typeof FilePreviewVisibility)[keyof typeof FilePreviewVisibility];

export const FilePreviewType = {
	None: 0,
	Text: 1,
	Image: 2,
	Thumbnail: 4,
	All: 7,
} as const;

export type FilePreviewType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const Theme = {
	Default: 0,
	Yaru: 1,
	Custom: 2,
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

export const ColorScheme = {
	System: 0,
	Dark: 1,
	Light: 2,
	HighContrast: 3,
} as const;

export type ColorScheme = (typeof ColorScheme)[keyof typeof ColorScheme];

export const CustomColorScheme = {
	Dark: 0,
	Light: 1,
	HighContrast: 2,
} as const;

export type CustomColorScheme = (typeof CustomColorScheme)[keyof typeof CustomColorScheme];

export const OpenClipboardDialogBehavior = {
	Toggle: 0,
	OpenOrSelectNext: 1,
} as const;

export type OpenClipboardDialogBehavior =
	(typeof OpenClipboardDialogBehavior)[keyof typeof OpenClipboardDialogBehavior];

export const MiddleClickAction = {
	None: 0,
	Pin: 1,
	Delete: 2,
} as const;

export type MiddleClickAction = (typeof MiddleClickAction)[keyof typeof MiddleClickAction];

export const IndicatorDisplay = {
	Hidden: 0,
	IconOnly: 1,
	ClipboardContentOnly: 2,
	IconAndClipboardContent: 3,
} as const;

export type IndicatorDisplay = (typeof IndicatorDisplay)[keyof typeof IndicatorDisplay];

type SettingsEnumTypes = {
	[Settings.DatabaseBackend]: DatabaseBackend;
	[Settings.ClipboardHistory]: ClipboardHistory;
	[Settings.IndicatorDisplay]: IndicatorDisplay;
	[Settings.ClipboardOrientation]: Orientation;
	[Settings.ClipboardPositionVertical]: Position;
	[Settings.ClipboardPositionHorizontal]: Position;
	[Settings.HeaderControlsVisibility]: HeaderControlsVisibility;
	[Settings.MiddleClickAction]: MiddleClickAction;
	[Settings.OpenClipboardDialogBehavior]: OpenClipboardDialogBehavior;

	[ChildKeys.TextItem]: {
		[Settings.TextItem.TextCountMode]: TextCountMode;
	};

	[ChildKeys.CodeItem]: {
		[Settings.CodeItem.TextCountMode]: TextCountMode;
	};

	[ChildKeys.ImageItem]: {
		[Settings.ImageItem.BackgroundSize]: BackgroundSize;
	};

	[ChildKeys.FileItem]: {
		[Settings.FileItem.FilePreviewVisibility]: FilePreviewVisibility;
		[Settings.FileItem.FilePreviewTypes]: FilePreviewType;
		[Settings.FileItem.BackgroundSize]: BackgroundSize;
	};

	[ChildKeys.LinkItem]: {
		[Settings.LinkItem.LinkPreviewImageBackgroundSize]: BackgroundSize;
		[Settings.LinkItem.LinkPreviewOrientation]: Orientation;
	};

	[ChildKeys.CharacterItem]: object;

	[ChildKeys.Theme]: {
		[Settings.Theme.Theme]: Theme;
		[Settings.Theme.ColorScheme]: ColorScheme;
		[Settings.Theme.CustomColorScheme]: CustomColorScheme;
	};
};

export type KeysWithValue<T, V extends ValueTypes> = {
	[K in Extract<keyof T, string>]: T[K] extends V ? K : never;
}[Extract<keyof T, string>];

export type SettingsKeys<T> = {
	[V in ValueTypes]: { [K in KeysWithValue<T, V>]: K }[KeysWithValue<T, V>];
}[ValueTypes];

type ChangedKeys<T> =
	| { [V in ValueTypes]: { [K in KeysWithValue<T, V>]: `changed::${K}` }[KeysWithValue<T, V>] }[ValueTypes]
	| 'changed';

type SettingsFunctions =
	| 'get_boolean'
	| 'set_boolean'
	| 'get_double'
	| 'set_double'
	| 'get_enum'
	| 'set_enum'
	| 'get_flags'
	| 'set_flags'
	| 'get_int'
	| 'set_int'
	| 'get_string'
	| 'set_string'
	| 'get_strv'
	| 'set_strv'
	| 'get_child'
	| 'bind'
	| 'connect'
	| 'connectObject';

export interface TypedSettings<
	T,
	TEnum extends { [K in KeysWithValue<T, 'enum'> | KeysWithValue<T, 'flags'>]: unknown },
> extends Omit<Gio.Settings, SettingsFunctions> {
	get_boolean(key: KeysWithValue<T, 'boolean'>): boolean;
	set_boolean(key: KeysWithValue<T, 'boolean'>, value: boolean): boolean;
	get_double(key: KeysWithValue<T, 'double'>): number;
	set_double(key: KeysWithValue<T, 'double'>, value: number): boolean;
	get_enum<K extends KeysWithValue<T, 'enum'>>(key: K): TEnum[K];
	set_enum<K extends KeysWithValue<T, 'enum'>>(key: K, value: TEnum[K]): boolean;
	get_flags<K extends KeysWithValue<T, 'flags'>>(key: K): TEnum[K];
	set_flags<K extends KeysWithValue<T, 'flags'>>(key: K, flags: TEnum[K]): boolean;
	get_int(key: KeysWithValue<T, 'int'>): number;
	set_int(key: KeysWithValue<T, 'int'>, value: number): boolean;
	get_string(key: KeysWithValue<T, 'string'>): string;
	set_string(key: KeysWithValue<T, 'string'>, value: string): boolean;
	get_strv(key: KeysWithValue<T, 'strv'>): string[];
	set_strv(key: KeysWithValue<T, 'strv'>, value: string[]): void;
	bind(key: keyof T, object: GObject.Object, property: string, flags: Gio.SettingsBindFlags | null): void;
	connect(signal: ChangedKeys<T>, callback: (...args: unknown[]) => unknown): number;
	connectObject<const TArgs extends (ChangedKeys<T> | (() => void))[]>(...args: [...TArgs, unknown]): void;
}

export type TextItemSettings = TypedSettings<(typeof SettingsTypes)['text-item'], SettingsEnumTypes['text-item']>;

export type CodeItemSettings = TypedSettings<(typeof SettingsTypes)['code-item'], SettingsEnumTypes['code-item']>;

export type ImageItemSettings = TypedSettings<(typeof SettingsTypes)['image-item'], SettingsEnumTypes['image-item']>;

export type FileItemSettings = TypedSettings<(typeof SettingsTypes)['file-item'], SettingsEnumTypes['file-item']>;

export type LinkItemSettings = TypedSettings<(typeof SettingsTypes)['link-item'], SettingsEnumTypes['link-item']>;

export type CharacterItemSettings = TypedSettings<
	(typeof SettingsTypes)['character-item'],
	SettingsEnumTypes['character-item']
>;

export type ThemeSettings = TypedSettings<(typeof SettingsTypes)['theme'], SettingsEnumTypes['theme']>;

export interface CopyousSettings extends TypedSettings<typeof SettingsTypes, SettingsEnumTypes> {
	get_child(name: typeof ChildKeys.TextItem): TextItemSettings;
	get_child(name: typeof ChildKeys.CodeItem): CodeItemSettings;
	get_child(name: typeof ChildKeys.ImageItem): ImageItemSettings;
	get_child(name: typeof ChildKeys.FileItem): FileItemSettings;
	get_child(name: typeof ChildKeys.LinkItem): LinkItemSettings;
	get_child(name: typeof ChildKeys.CharacterItem): CharacterItemSettings;
	get_child(name: typeof ChildKeys.Theme): ThemeSettings;
}

export function bind_enum<T, TEnum extends { [K in KeysWithValue<T, 'enum'> | KeysWithValue<T, 'flags'>]: unknown }>(
	settings: TypedSettings<T, TEnum>,
	key: KeysWithValue<T, 'enum'>,
	object: GObject.Object,
	property: string,
): void {
	object.set_property(property, settings.get_enum(key));

	settings.connect(`changed::${key}`, () => object.set_property(property, settings.get_enum(key)));
	object.connect(`notify::${property}`, () => {
		const value = (object as unknown as Record<string, number>)[property];
		if (value != null) settings.set_enum(key, value as TEnum[typeof key]);
	});
}

export function bind_flags<T, TEnum extends { [K in KeysWithValue<T, 'enum'> | KeysWithValue<T, 'flags'>]: unknown }>(
	settings: TypedSettings<T, TEnum>,
	key: KeysWithValue<T, 'flags'>,
	object: GObject.Object,
	property: string,
): void {
	object.set_property(property, settings.get_flags(key));

	settings.connect(`changed::${key}`, () => object.set_property(property, settings.get_flags(key)));
	object.connect(`notify::${property}`, () => {
		const value = (object as unknown as Record<string, number>)[property];
		if (value != null) settings.set_flags(key, value as TEnum[typeof key]);
	});
}

function getIndicatorDisplay(showIcon: boolean, showContent: boolean): IndicatorDisplay {
	if (showIcon && showContent) return IndicatorDisplay.IconAndClipboardContent;
	if (showIcon) return IndicatorDisplay.IconOnly;
	if (showContent) return IndicatorDisplay.ClipboardContentOnly;
	return IndicatorDisplay.Hidden;
}

export function migrateSettings(settings: CopyousSettings): void {
	// inverted paste-on-copy -> swap-copy-shortcut
	const pasteOnCopy = settings.get_user_value<'b'>('paste-on-copy');
	if (pasteOnCopy !== null) settings.set_boolean('swap-copy-shortcut', !pasteOnCopy.get_boolean());
	settings.reset('paste-on-copy');

	// show-indicator + show-content-indicator -> indicator-display
	const indicatorDisplay = settings.get_user_value('indicator-display');
	const showIndicator = settings.get_user_value<'b'>('show-indicator');
	const showContentIndicator = settings.get_user_value<'b'>('show-content-indicator');
	if (indicatorDisplay === null && (showIndicator !== null || showContentIndicator !== null)) {
		const showIcon = showIndicator?.get_boolean() ?? settings.get_boolean('show-indicator');
		const showContent = showContentIndicator?.get_boolean() ?? settings.get_boolean('show-content-indicator');
		settings.set_enum('indicator-display', getIndicatorDisplay(showIcon, showContent));
	}
	settings.reset('show-indicator');
	settings.reset('show-content-indicator');
}
