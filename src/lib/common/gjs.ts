import GObject from 'gi://GObject';

export type SignalDefinitions = Record<
	string,
	{
		param_types?: readonly GObject.GTypeInput[];
		[key: string]: unknown;
	}
>;

type SignalParameters<Definition> = Definition extends {
	param_types: infer Types extends readonly GObject.GTypeInput[];
}
	? { -readonly [Index in keyof Types]: Types[Index] extends GObject.GTypeInput<infer Type> ? Type : never }
	: [];

export type SignalSignatures<Signals extends SignalDefinitions> = {
	[Name in keyof Signals]: (...args: SignalParameters<Signals[Name]>) => void;
};

/**
 * Signal methods for a class registered with {@link registerClass}.
 */
export type SignalMethods<Emitter, Signals extends SignalDefinitions> = GObject.SignalMethods<
	Emitter,
	SignalSignatures<Signals>
> &
	Pick<GObject.Object, 'connect' | 'connect_after' | 'emit'>;

/**
 * GObject.registerClass wrapper for use with decorators
 */
export function registerClass<
	T extends GObject.Ctor,
	Props extends { [key: string]: GObject.ParamSpec },
	Interfaces extends { $gtype: GObject.GType }[],
	Sigs extends SignalDefinitions,
>(options?: GObject.MetaInfo<Props, Interfaces, Sigs>) {
	if (options) {
		return (cls: T): void => {
			GObject.registerClass(options, cls);
		};
	} else {
		return (cls: T): void => {
			GObject.registerClass(cls);
		};
	}
}

@registerClass({
	Properties: {
		jsobject: GObject.ParamSpec.jsobject('jsobject', null, null, GObject.ParamFlags.READABLE),
	},
})
export class JsObjectWrapper<T> extends GObject.Object {
	constructor(public jsobject: T) {
		super();
	}
}

export function int32ParamSpec(name: string, flags: GObject.ParamFlags, defaultValue: number): GObject.ParamSpec {
	return GObject.ParamSpec.int(name, null, null, flags, 0, 2147483647, defaultValue);
}

export function enumParamSpec(name: string, flags: GObject.ParamFlags, e: object, defaultValue: number) {
	const values = Object.values(e)
		.map((k) => +k)
		.filter((k) => Number.isInteger(k));

	const min = Math.min(...values);
	const max = Math.max(...values);
	return GObject.ParamSpec.int(name, null, null, flags, min, max, defaultValue);
}

export function flagsParamSpec(name: string, flags: GObject.ParamFlags, e: object, defaultValue: number) {
	const values = Object.values(e)
		.map((k) => +k)
		.filter((k) => Number.isInteger(k));

	const max = (2 << Math.log2(Math.floor(Math.max(...values)))) - 1;
	return GObject.ParamSpec.int(name, null, null, flags, 0, max, defaultValue);
}
