/// <reference types="node" />
import * as fs from 'node:fs';
import { RawSourceMap, SourceMapConsumer } from 'source-map';

type Evidence = {
	path: string;
	line: number | null;
	snippet: string | null;
};

type Finding = {
	rule_id: string;
	title: string;
	severity: string;
	message: string;
	evidence: Evidence[];
	source_url: string;
	source_section: string;
};

type Summary = {
	input_path: string;
	finding_count: number;
	severity_counts: Record<string, number>;
	status: string;
};

type AnalysisResult = {
	spec_version: string;
	summary: Summary;
	findings: Finding[];
	artifacts: Record<string, unknown>;
};

function colorSeverity(severity: string) {
	switch (severity) {
		case 'error':
			return '\x1b[31merror\x1b[0m';
		case 'warning':
			return '\x1b[33mwarning\x1b[0m';
		case 'manual_review':
			return '\x1b[34mmanual_review\x1b[0m';
		default:
			return severity;
	}
}

function logEvidence(finding: Finding, evidence: Evidence) {
	const log = (() => {
		switch (finding.severity) {
			case 'error':
				return console.error;
			case 'warning':
				return console.warn;
			default:
				return console.log;
		}
	})();

	const severity = colorSeverity(finding.severity);

	if (evidence.line === null && evidence.snippet !== null && fs.existsSync(evidence.path)) {
		const snippet = evidence.snippet.split('\n')[0]!.replace(/'/g, '"');
		const file = fs.readFileSync(evidence.path, 'utf8');
		for (const [i, line] of file.split('\n').entries()) {
			if (line.replace(/'/g, '"').includes(snippet)) {
				evidence.line = i + 1;
				break;
			}
		}
	}

	console.log();
	log(`${evidence.path}:${evidence.line ?? 1} - ${severity} \x1b[2m${finding.rule_id}:\x1b[0m ${finding.message}`);
	if (evidence.line === null && evidence.snippet !== null) console.log(evidence.snippet);
}

const result = JSON.parse(fs.readFileSync(0, 'utf8')) as AnalysisResult;

let hasErrors = false;
for (const finding of result.findings) {
	if (finding.severity === 'error' || finding.severity === 'warning') {
		hasErrors = true;
	}

	for (const evidence of finding.evidence) {
		evidence.path = evidence.path.split(':')[1]!;
		if (!evidence.path.endsWith('.js')) {
			evidence.path = `dist/${evidence.path}`;
			logEvidence(finding, evidence);
			continue;
		}

		const path = `dist/sourcemaps/${evidence.path}.map`;
		const map = JSON.parse(fs.readFileSync(path, 'utf8')) as RawSourceMap;

		// eslint-disable-next-line no-await-in-loop
		const consumer = await new SourceMapConsumer(map);
		const position = consumer.originalPositionFor({
			line: evidence.line ?? 1,
			column: 0,
			bias: SourceMapConsumer.LEAST_UPPER_BOUND,
		});
		consumer.destroy();

		evidence.path = `${map.sourceRoot}${map.sources[0]}`;
		evidence.line = position.line;
		logEvidence(finding, evidence);
	}
}

if (hasErrors) {
	process.exitCode = 1;
}
