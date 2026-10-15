import assert from 'node:assert/strict';
import test from 'node:test';

import { isConstructable } from '../src/lib/common/constructable.ts';

test('accepts functions that can be used as class superclasses', () => {
	assert.equal(isConstructable(class Example {}), true);
	assert.equal(isConstructable(function Example() {}), true);
});

test('rejects callable values that cannot be used as class superclasses', () => {
	assert.equal(isConstructable(() => {}), false);
	assert.equal(isConstructable({}), false);
});
