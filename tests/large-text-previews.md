# Large text preview checks

Build the extension and native GNOME Shell tests:

```sh
RELEASE=1 make build
pnpm exec tsc -p tsconfig.tests.json
```

Run each test in a fresh private D-Bus session. Isolate the outer XDG directories
as well as the Shell profile so activated desktop services cannot use personal
accounts or clipboard history:

```sh
profile=$(mktemp -d)
mkdir -m700 "$profile/config" "$profile/data" "$profile/cache" "$profile/runtime"
env -u DISPLAY -u WAYLAND_DISPLAY -u SESSION_MANAGER \
  XDG_CONFIG_HOME="$profile/config" XDG_DATA_HOME="$profile/data" \
  XDG_CACHE_HOME="$profile/cache" XDG_RUNTIME_DIR="$profile/runtime" \
  dbus-run-session -- gnome-shell-test-tool --headless \
  --extension dist/copyous@boerdereinar.dev.zip \
  dist/tests/shell/textPreview.js
```

- `textPreview.js` checks native labels, grapheme boundaries, direction,
  resizing, searching beyond the preview, real clipboard copying, and editor input.
- `textPreviewVisual.js` compares screenshot pixels from the same native card
  before and after applying the preview limit. It includes short text, long lines
  and paragraphs, emoji, RTL and neutral paragraphs, indentation, and large cards.
  Synthetic screenshots remain in the temporary path printed by the test.
- `largeTextPerformance.js` measures actual window opening with 50 synthetic text
  cards, four containing 65–151k characters. It invalidates text layout caches while
  hidden before measuring a cold reopen and records a 10ms main-loop heartbeat.
  Add `--perf-output /tmp/large-text.json` to retain metrics. Set
  `COPYOUS_UNBOUNDED_PREVIEWS=1` in the environment for the unbounded comparison;
  this changes only the native test actors, using the same extension binary.

Run timing samples sequentially on an otherwise idle machine, with a new profile
and bus for each sample. These measurements cover synchronous Shell opening and
main-loop blocking, rather than end-to-end frame latency. Pixel comparisons cover
the test fixtures and current theme; they do not prove equivalence for every font
or possible Unicode string. Inspect logs as well as process exit codes, because
Shell can log asynchronous failures without failing the test tool. A missing
optional `highlight.min.js` import in an empty profile is unrelated to these text
checks.
