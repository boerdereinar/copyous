export function isConstructable(value: unknown): value is new () => object {
	if (typeof value !== 'function') return false;

	try {
		Reflect.construct(Object, [], value);
		return true;
	} catch {
		return false;
	}
}
