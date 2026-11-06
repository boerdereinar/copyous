import type { HLJSApi } from 'highlight.js';

import type { Language } from '../database/database.js';

const names: Record<string, string> = {
	javascript: 'JavaScript',
	typescript: 'TypeScript',
	python: 'Python',
	bash: 'Bash',
	sql: 'SQL',
	json: 'JSON',
	xml: 'HTML/XML',
	css: 'CSS',
	php: 'PHP',
	cpp: 'C/C++',
	java: 'Java',
	shell: 'Terminal',
};

/** Split a terminal prompt from its command without modifying the stored text. */
export function splitTerminalPrompt(line: string): [string, string] | null {
	const match = line.match(
		/^(\s*(?:(?:\([^\r\n()]+\)\s*)?[\w.-]+@[\w.-]+:[^\r\n$#]*[$#]\s*|\$\s+(?=[a-z_./~])))(.*)$/i,
	);
	return match ? [match[1]!, match[2]!] : null;
}

// Strong syntax signals also work when optional syntax highlighting is unavailable.
const syntax: [string, RegExp][] = [
	['typescript', /^\s*(?:export\s+)?(?:interface\s+\w+[^\r\n]*\{|type\s+\w+(?:<[^>]+>)?\s*=)/m],
	[
		'python',
		/^\s*(?:(?:async\s+)?def\s+\w+\([^)]*\)\s*(?:->[^:\r\n]+)?\s*:|class\s+\w+(?:\([^)]*\))?\s*:|from\s+[\w.]+\s+import\s+[\w*])/m,
	],
	[
		'javascript',
		/^\s*(?:(?:export\s+(?:default\s+)?)?(?:(?:const|let|var)\s+(?:[\w$]+|\{[^}]+\}|\[[^\]]+\])(?:\s*:[^=\r\n]+)?\s*=|(?:async\s+)?function\s*[\w$]*\s*\()|console\.(?:log|warn|error)\s*\(|import\s+[^\r\n]*['"][^'"]+['"]\s*;?\s*$)/m,
	],
	[
		'bash',
		/^(?:#![^\r\n]*\b(?:bash|sh|zsh)\b|\s*(?:sudo\s+(?:-\S+\s+)*[\w./-]+\b|(?:apt|apt-get|dnf)\s+(?:update|upgrade|install|remove|autoremove|search|list)\b|git\s+(?:clone|status|diff|checkout|switch|add|commit|log|fetch|pull|push)\b|(?:npm|pnpm|yarn)\s+(?:install|add|run|test|build|exec)\b|(?:curl|wget)\s+(?:-\S+|https?:\/\/)|(?:ls|find|mkdir|rm|chmod|chown)\s+(?:-\S+|[.~/])|cd\s+[.~/]|(?:echo|printf)\s+['"]|export\s+\w+=|set\s+-[euxo]+\b))/m,
	],
	[
		'sql',
		/^\s*(?:SELECT\b[\s\S]+?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|CREATE\s+TABLE\b|DELETE\s+FROM\b|ALTER\s+TABLE\b)/i,
	],
	['php', /^\s*<\?php\b/],
	['xml', /^\s*(?:<!doctype\s+html\b|<\?xml\s|<\/?[a-z][\w:-]*(?:\s+[^<>]*|)\s*\/?>)/i],
	['css', /^\s*(?:[.#][\w-]+|html|body|button|div|span|input)\s*\{\s*[\w-]+\s*:/m],
	['cpp', /^\s*#include\s+[<"][^>"\r\n]+[>"]/m],
	['java', /^\s*public\s+(?:class\s+\w+|static\s+void\s+main\s*\()/m],
];

/** Identify bounded code samples without changing the copied text. */
export function detectCode(text: string, highlighter?: HLJSApi | null): Language | null {
	const sample = text.slice(0, 10000).trim();
	const language = (id: string): Language => ({ id, name: highlighter?.getLanguage(id)?.name ?? names[id] ?? id });
	const fence = sample.match(/^(`{3,}|~{3,})([\w+-]*)[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\1\s*$/);
	if (fence) {
		const id = fence[2]!.toLowerCase();
		if (['text', 'plaintext', 'txt'].includes(id)) return null;
		if (id && (highlighter?.getLanguage(id) || names[id])) return language(id);
		return detectCode(fence[3]!, highlighter);
	}
	if (sample.split('\n').some((line) => splitTerminalPrompt(line)?.[1].trim())) {
		return { id: 'shell', name: names['shell']! };
	}
	if (/^[{[]/.test(sample)) {
		try {
			const value: unknown = JSON.parse(sample);
			if (value !== null && typeof value === 'object') return language('json');
		} catch {
			// Incomplete objects can still be recognized by the syntax checks below.
		}
	}
	for (const [id, pattern] of syntax) {
		if (pattern.test(sample)) return language(id);
	}
	// A language score alone also matches ordinary prose and contact lists.
	if (!highlighter || !/(?:[{};]|=>|\b\w+\(|^\s*[\w.]+\s*=)/m.test(sample)) return null;
	const result = highlighter.highlightAuto(sample);
	return result.language && result.relevance >= 5 ? language(result.language) : null;
}
