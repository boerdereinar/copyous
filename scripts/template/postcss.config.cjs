const fs = require('fs');
const postcss = require('postcss');

const generateTemplate = (opts = { variant: 'dark', contrast: 'normal' }) => {
	const variables = ['bg_color', 'fg_color', 'card_bg_color', 'search_bg_color'];

	// var -> {$var: '#{"$"}var'}
	const decls = Object.fromEntries(
		variables.map((variable) => [`$${variable}`, (decl) => (decl.value = `#{"$"}${variable}`)]),
	);

	return {
		postcssPlugin: 'generate-template',
		Once: (root) => {
			root.prepend(postcss.decl({ prop: '$variant', value: `'${opts.variant}'` }));
			root.prepend(postcss.decl({ prop: '$contrast', value: `'${opts.contrast}'` }));
		},
		Rule: (rule) => {
			if (rule.selector === 'stage') rule.remove();
		},
		Comment: (comment) => {
			comment.remove();
		},
		Declaration: {
			...decls,
			'*': (decl) => {
				decl.value = decl.value
					.replace(/(?<![{_-])lighten/g, 'st-lighten')
					.replace(/(?<![{_-])darken/g, 'st-darken')
					.replace(/(?<![{_-])transparentize/g, 'st-transparentize')
					.replace(/(?<![{_-])mix/g, 'st-mix');
			},
		},
	};
};

function resolveScss(id, baseDir, options) {
	if (process.env.CONTRAST === 'high' && id === '_colors') {
		id = '_high-contrast-colors';
	}

	const ids = [];
	if (/.\../.test(id)) {
		ids.push(id);
	} else {
		ids.push(`${id}.scss`);
		if (!id.startsWith('_')) ids.push(`_${id}.scss`);
	}

	const paths = options.path.flatMap((path) => ids.map((id) => `${path}/${id}`));
	return paths.find((path) => fs.existsSync(path));
}

module.exports = {
	parser: 'postcss-scss',
	plugins: [
		require('postcss-import')({
			path: ['resources/css', 'resources/css/gnome-shell-sass'],
			resolve: resolveScss,
		}),
		generateTemplate({
			variant: process.env.VARIANT ? process.env.VARIANT : 'dark',
			contrast: process.env.CONTRAST ? process.env.CONTRAST : 'normal',
		}),
	],
};
