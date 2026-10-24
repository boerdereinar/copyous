# Native Shell tests

These tests use real GJS/GObject/St actors in an isolated GNOME Shell, with the maintainer's `gnome-shell-test-tool` runner. No actor or GI substitutes are used. The runner also rejects asynchronous JavaScript errors and native criticals even when Shell returns exit code zero; a missing optional highlighter import is allowed in the isolated profile. The tool installs the archive into temporary XDG directories; synthetic entries never enter personal clipboard history.

```sh
RELEASE=1 make build
SHELL_TEST_MODE=headless make test
```

The default mode remains `devkit`; set `SHELL_TEST_MODE=headless` on systems without Mutter Devkit.

- `history.ts`: timestamp order/ties/moves, filtered startup status and card-edge styles, notifications, clearing/reloading/deletion, focus in both orientations, and native parent destruction.
- `icons.ts`: actual `St.ImageContent` textures for every bundled/system icon, repeated actor destruction/recreation, mapping, and icon-theme invalidation.
- `historyPerformance.ts`: insertion and total construction plus insertion time for 1,000 real text cards in each timestamp direction. Construction is excluded from the insertion metric and included in the population metric. Containers are hidden to measure synchronous population work, excluding rendering and preview I/O.
- `performance.ts`: the existing clipboard-window opening test.

For before/after comparisons, run the same compiled `historyPerformance.js` against both archives, sequentially on an otherwise idle machine:

```sh
dbus-run-session -- gnome-shell-test-tool --headless --test-iters 3 \
  --extension /path/to/build.zip dist/tests/shell/historyPerformance.js \
  --perf-output /tmp/history-performance.json
```

The JSON retains individual samples. These timings measure synchronous work in Shell, not frame latency or pixel equivalence. The icon checks exercise normal loading and invalidation; they cannot establish that every long-running GPU/session failure is resolved.
