// SPDX-License-Identifier: CC0-1.0
// SPDX-FileCopyrightText: No rights reserved
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import ts from 'typescript-eslint';

export default [
	js.configs.recommended,
	...ts.configs.recommendedTypeChecked,
	{
		plugins: {
			'@stylistic': stylistic,
		},
		languageOptions: {
			globals: {
				ARGV: 'readonly',
				Debugger: 'readonly',
				GIRepositoryGType: 'readonly',
				globalThis: 'readonly',
				imports: 'readonly',
				Intl: 'readonly',
				log: 'readonly',
				logError: 'readonly',
				pkg: 'readonly',
				print: 'readonly',
				printerr: 'readonly',
				window: 'readonly',
				TextEncoder: 'readonly',
				TextDecoder: 'readonly',
				console: 'readonly',
				setTimeout: 'readonly',
				setInterval: 'readonly',
				clearTimeout: 'readonly',
				clearInterval: 'readonly',
				// GNOME Shell Only
				global: 'readonly',
				_: 'readonly',
				C_: 'readonly',
				N_: 'readonly',
				ngettext: 'readonly',
			},
			parserOptions: {
				ecmaVersion: 2024,
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
				projectService: {
					allowDefaultProject: ['scripts/shexli/*.ts'],
				},
			},
		},
		rules: {
			// See: https://eslint.org/docs/latest/rules/#possible-problems
			'array-callback-return': 'error',
			'no-await-in-loop': 'error',
			'no-constant-binary-expression': 'error',
			'no-constructor-return': 'error',
			'no-new-native-nonconstructor': 'error',
			'no-promise-executor-return': 'error',
			'no-self-compare': 'error',
			'no-template-curly-in-string': 'error',
			'no-unmodified-loop-condition': 'error',
			'no-unreachable-loop': 'error',
			'no-unused-private-class-members': 'error',
			// See: https://eslint.org/docs/latest/rules/#suggestions
			'block-scoped-var': 'error',
			'default-param-last': 'error',
			'eqeqeq': ['error', 'always', { null: 'ignore' }],
			'no-array-constructor': 'error',
			'no-caller': 'error',
			'no-extend-native': 'error',
			'no-extra-bind': 'error',
			'no-extra-label': 'error',
			'no-iterator': 'error',
			'no-label-var': 'error',
			'no-loop-func': 'error',
			'no-multi-assign': 'warn',
			'no-new-object': 'error',
			'no-new-wrappers': 'error',
			'no-proto': 'error',
			'no-shadow': 'warn',
			'no-var': 'warn',
			'unicode-bom': 'error',
			// GJS Restrictions
			'no-restricted-globals': [
				'error',
				{ name: 'Debugger', message: 'Internal use only' },
				{ name: 'GIRepositoryGType', message: 'Internal use only' },
				{ name: 'log', message: 'Use console.log()' },
				{ name: 'logError', message: 'Use console.warn() or console.error()' },
			],
			'no-restricted-properties': [
				'error',
				{ object: 'imports', property: 'format', message: 'Use template strings' },
				{ object: 'pkg', property: 'initFormat', message: 'Use template strings' },
				{ object: 'Lang', property: 'copyProperties', message: 'Use Object.assign()' },
				{ object: 'Lang', property: 'bind', message: 'Use arrow notation or Function.prototype.bind()' },
				{ object: 'Lang', property: 'Class', message: 'Use ES6 classes' },
			],
			'no-restricted-syntax': [
				'error',
				{
					selector:
						'MethodDefinition[key.name="_init"] CallExpression[arguments.length<=1][callee.object.type="Super"][callee.property.name="_init"]',
					message: 'Use constructor() and super()',
				},
			],
			// Extra rules
			'no-useless-escape': ['error', { allowRegexCharacters: ['['] }],
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-misused-promises': 'off',
			'@stylistic/lines-between-class-members': [
				'error',
				{
					enforce: [
						{ blankLine: 'always', prev: '*', next: 'method' },
						{ blankLine: 'always', prev: 'method', next: '*' },
					],
				},
			],
			'@stylistic/padding-line-between-statements': [
				'error',
				{ blankLine: 'always', prev: '*', next: ['class', 'export', 'function'] },
				{ blankLine: 'always', prev: ['class', 'export', 'function'], next: '*' },
			],
			'@stylistic/lines-around-comment': [
				'error',
				{
					beforeLineComment: true,
					allowBlockStart: true,
				},
			],
		},
	},
	prettier,
	{
		ignores: ['src/thirdparty/*'],
	},
];
