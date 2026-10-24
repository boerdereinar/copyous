#!/usr/bin/env bash

set -u -o pipefail

UUID="copyous@boerdereinar.dev"

DIST_DIR="dist"
DIST_ZIP="$DIST_DIR/$UUID.zip"

TESTS_DIR="$DIST_DIR/tests/shell"
OUTPUT_DIR="$DIST_DIR/tests/out/shell"

BOLD=$'\033[1m'
DIM=$'\033[2m'
CYAN=$'\033[36m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RESET=$'\033[0m'

shopt -s nullglob
tests=("$TESTS_DIR"/*.js)

if ((${#tests[@]} == 0)); then
	printf 'No shell tests found in %s.\n' "$TESTS_DIR" >&2
	exit 1
fi

mkdir -p "$OUTPUT_DIR"

status=0
successful_tests=()
for test in "${tests[@]}"; do
	test_name=${test##*/}
	test_name=${test_name%.js}
	output="$OUTPUT_DIR/$test_name.json"

	log="$OUTPUT_DIR/$test_name.log"
	if dbus-run-session -- gnome-shell-test-tool --"${SHELL_TEST_MODE:-devkit}" --extension "$DIST_ZIP" "$test" --perf-output "$output" >"$log" 2>&1; then
		# Shell can exit successfully despite asynchronous native/JS failures.
		# The optional highlighter is absent in the isolated profile.
		if grep -E 'CRITICAL|JS ERROR:|Unhandled promise rejection' "$log" | grep -vE 'JS ERROR: ImportError:.*highlight[.]min[.]js'; then
			status=1
		else
			successful_tests+=("$test_name")
		fi
	else
		cat "$log"
		status=1
	fi
done

sleep 1

printf '%s' "$DIM"
printf '%0.s-' {1..60}
printf '%s\n' "$RESET"

for test_name in "${successful_tests[@]}"; do
	output="$OUTPUT_DIR/$test_name.json"

	if [[ ! -f "$output" ]]; then
		printf 'Missing performance output for shell/%s.js.\n' "$test_name" >&2
		status=1
		continue
	fi

	printf '%s%sshell/%s.ts%s\n' "$BOLD" "$CYAN" "$test_name" "$RESET"
	printf '%s' "$DIM"
	printf '%0.s-' {1..60}
	printf '%s\n' "$RESET"
	if ! jq -r --arg bold "$BOLD" --arg cyan "$CYAN" --arg green "$GREEN" --arg yellow "$YELLOW" --arg reset "$RESET" '
		.metrics
		| to_entries[]
		| . as $metric
		| ($metric.value.values | add / length) as $value
		| "\($bold)\($cyan)# \($metric.value.description)\($reset)\n\($bold)\($green)\($metric.key)\($reset) \($yellow)\($value) \($metric.value.units)\($reset)"
	' "$output"; then
		status=1
	fi
	printf '%s' "$DIM"
	printf '%0.s-' {1..60}
	printf '%s\n' "$RESET"
done

exit "$status"
