import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { detectCode, splitTerminalPrompt } from '../../src/lib/common/codeDetection.ts';

const modulePath = process.env['COPYOUS_HLJS_PATH'];
const { default: hljs } = await import(modulePath ? pathToFileURL(modulePath).href : 'highlight.js');
const positive = [
	['JavaScript declaration', 'const total = prices.reduce((sum, value) => sum + value, 0);', 'javascript'],
	[
		'Long JavaScript',
		`export function calculateTotal(items) {\n  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);\n  return { total, description: "${'Long product description '.repeat(25)}" };\n}`,
		'javascript',
	],
	['Short JavaScript', 'console.log("Hello");', 'javascript'],
	['TypeScript interface', 'export interface User { name: string; active: boolean; }', 'typescript'],
	['Python', 'def greet(name):\n    return f"Hello, {name}!"', 'python'],
	['Python import', 'from pathlib import Path', 'python'],
	['Shell command', 'git status --short', 'bash'],
	['Ubuntu package command', 'sudo apt update', 'bash'],
	['Bare package command', 'apt list --upgradable', 'bash'],
	['Shell listing', 'ls -la', 'bash'],
	['Quoted shell output', 'echo "Olá"', 'bash'],
	['Terminal command', 'dev@ubuntu:~$ sudo apt update', 'shell'],
	['Root terminal command', 'root@ubuntu:/var/log# journalctl --since today', 'shell'],
	['Virtual environment prompt', '(venv) dev@ubuntu:~/projeto$ python3 main.py', 'shell'],
	['Bare dollar prompt', '$ git status --short', 'shell'],
	[
		'Terminal transcript',
		'dev@ubuntu:~$ sudo apt update\n[sudo: authenticate] Senha:\nAtingido:1 http://archive.ubuntu.com/ubuntu stable InRelease\nObtidos 147 kB em 1s\n2 pacotes podem ser atualizados.\ndev@ubuntu:~$',
		'shell',
	],
	['Shell script', '#!/usr/bin/env bash\nset -e\ngit status --short', 'bash'],
	['SQL query', 'SELECT name, email FROM users WHERE active = true;', 'sql'],
	['JSON object', '{"name": "Copyous", "enabled": true}', 'json'],
	['JSON array', '[1, 2, 3]', 'json'],
	['HTML', '<div class="card"><strong>Hello</strong></div>', 'xml'],
	['CSS', '.card { color: red; padding: 8px; }', 'css'],
	['PHP', '<?php echo "Hello";', 'php'],
	['C/C++', '#include <stdio.h>\nint main() { return 0; }', 'cpp'],
	['Java', 'public class Main { public static void main(String[] args) {} }', 'java'],
	['Declared fenced language', '```python\nanswer = 42\n```', 'python'],
	['Untyped fenced code', '```\nconst answer = 42;\n```', 'javascript'],
];
for (const [name, input, language] of positive) {
	test(name, () => assert.equal(detectCode(input, hljs)?.id, language));
}
for (const input of [
	'Precisamos conferir os documentos e conversar sobre os resultados amanhã.',
	'O código usa uma função para calcular o total. Depois, retorna o resultado.',
	'Le rapport contient une description complète des documents et des résultats.',
	'Rua das Palmeiras, 150 - Centro',
	'Use git para versionar seus arquivos.',
	'Nome: Maria\nTelefone: 12345\nCidade: Manaus',
	'Favor revisar o contrato; depois enviar para análise.',
	'```text\nconst answer = 42;\n```',
	'2026-11-05',
	'dev@ubuntu:~$',
	'Atualize o sistema com sudo apt update quando puder.',
	'echo é um comando que imprime uma mensagem.',
	'ls é usado para listar arquivos.',
	'$ 100',
	'```text\ndev@ubuntu:~$ sudo apt update\n```',
	'',
]) {
	test(`Preserve ordinary text: ${input.slice(0, 30)}`, () => assert.equal(detectCode(input, hljs), null));
}
test('Strong code syntax works without the optional highlighter', () => {
	assert.equal(detectCode('def greet(name):\n    return name', null)?.id, 'python');
});
test('Ordinary prose stays text without the optional highlighter', () => {
	assert.equal(detectCode('O código usa uma função para calcular o total.', null), null);
});
test('Keep meaningful language names', () => {
	assert.equal(detectCode('const answer = 42;', hljs)?.name, 'JavaScript');
});
test('Keep prompt, command and output separate without consuming any characters', () => {
	const line = '  dev@ubuntu:~/pasta com espaços$ sudo apt update';
	const split = splitTerminalPrompt(line);
	assert.deepEqual(split, ['  dev@ubuntu:~/pasta com espaços$ ', 'sudo apt update']);
	assert.equal(split.join(''), line);
	assert.equal(splitTerminalPrompt('[sudo: authenticate] Senha:'), null);
});
test('Terminal sessions work without the optional highlighter', () => {
	assert.deepEqual(detectCode('dev@ubuntu:~$ sudo apt update\nTudo atualizado.\ndev@ubuntu:~$', null), {
		id: 'shell',
		name: 'Terminal',
	});
});
