#!/usr/bin/env bash

set -euo pipefail

TOOLBOX_NAME=${TOOLBOX_NAME:-copyous-devel}
version=''

while (($# > 0)); do
	case "$1" in
		--version)
			if (($# < 2)); then
				printf 'Option --version requires a Fedora version.\n' >&2
				exit 2
			fi
			version=$2
			shift
			;;
		--version=*)
			version=${1#--version=}
			;;
		*)
			printf 'Unknown option: %s\n' "$1" >&2
			exit 2
			;;
	esac
	shift
done

if [[ -z "$version" ]]; then
	printf 'Option --version is required.\n' >&2
	exit 2
fi

if ! command -v toolbox >/dev/null 2>&1; then
	printf 'toolbox is not installed.\n' >&2
	exit 1
fi

toolbox create -d fedora -r "$version" "$TOOLBOX_NAME"
toolbox run -c "$TOOLBOX_NAME" sudo dnf install -y gnome-shell mutter-devkit dbus-daemon libgda libgda-sqlite
