#!/usr/bin/env bash

branch="refs/tags/25.10.3"
base_url="https://raw.githubusercontent.com/ubuntu/yaru/${branch}"
out_dir="resources/css/themes/yaru/gnome-shell-sass"

files=(
	"gnome-shell/src/gnome-shell-sass/_colors.scss"
	"gnome-shell/src/gnome-shell-sass/_common.scss"
	"gnome-shell/src/gnome-shell-sass/_default-colors.scss"
	"gnome-shell/src/gnome-shell-sass/_drawing.scss"
	"gnome-shell/src/gnome-shell-sass/_high-contrast-colors.scss"
	"gnome-shell/src/gnome-shell-sass/_palette.scss"
	"gnome-shell/src/gnome-shell-sass/_yaru-colors.scss"
	"gnome-shell/src/gnome-shell-sass/_yaru-default-colors.scss"
	"common/sass-utils.scss"
)

set -e
for file in "${files[@]}"; do
	wget "${base_url}/${file}" -O "${out_dir}/$(basename "${file}")"
done
