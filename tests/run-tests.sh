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

# Arguments
verbose=false
headless=false
filter=''

while (($# > 0)); do
	case "$1" in
		--verbose)
			verbose=true
			;;
		--headless)
			headless=true
			;;
		--filter)
			if (($# < 2)); then
				printf 'Option --filter requires a glob pattern.\n' >&2
				exit 2
			fi
			filter=$2
			shift
			;;
		--filter=*)
			filter=${1#--filter=}
			;;
		*)
			printf 'Unknown option: %s\n' "$1" >&2
			exit 2
			;;
	esac
	shift
done

# Find tests
shopt -s nullglob
tests=("$TESTS_DIR"/*.js)

if ((${#tests[@]} == 0)); then
	printf 'No shell tests found in %s.\n' "$TESTS_DIR" >&2
	exit 1
fi

if [[ -n "$filter" ]]; then
	filtered_tests=()
	for test in "${tests[@]}"; do
		test_name=${test##*/}
		test_name=${test_name%.js}
		if [[ "$test_name" == $filter ]]; then
			filtered_tests+=("$test")
		fi
	done
	tests=("${filtered_tests[@]}")

	if ((${#tests[@]} == 0)); then
		printf 'No shell tests match filter: %s\n' "$filter" >&2
		exit 1
	fi
fi

mkdir -p "$OUTPUT_DIR"

# Run tests
status=0
successful_tests=()
for test in "${tests[@]}"; do
	test_name=${test##*/}
	test_name=${test_name%.js}
	output="$OUTPUT_DIR/$test_name.json"
	log="$OUTPUT_DIR/$test_name.txt"

	args=(--extension "$DIST_ZIP" "$test" --perf-output "$output")
	if [[ "$headless" == true ]]; then
		args+=(--headless)
	else
		args+=(--devkit)
	fi

	if [[ "$verbose" == true ]]; then
		dbus-run-session -- gnome-shell-test-tool "${args[@]}" 2>&1 | tee "$log"
	else
		dbus-run-session -- gnome-shell-test-tool "${args[@]}" >"$log" 2>&1
	fi

	if [[ $? -eq 0 ]]; then
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
