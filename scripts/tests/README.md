Run `pnpm test` for the queue, search/order, lifecycle, and native helper regressions. Native image and link tests skip if GJS or the required libraries are unavailable.

For a real GNOME Shell smoke test, run from the repository root:

```sh
RELEASE=1 make build
python3 scripts/tests/gnome-shell-smoke.py
```

The smoke test starts a private session bus and headless compositor with separate XDG directories, settings, and synthetic mixed history. It exercises horizontal/vertical opening and closing, disabling, re-enabling, and teardown, and checks the shell log for JavaScript errors. Test-only instrumentation also checks the native actor tree before opening: visible history must not coexist with the empty-state message, and at least one opening must contain the synthetic history. It does not modify the installed extension or personal clipboard history. If available, it reuses the locally installed public highlight.js dependency. A missing highlighter import is permitted; other JavaScript errors fail the test.

Logs and fixtures remain in the printed temporary directory. This is a lifecycle smoke test, not a pixel comparison or a latency benchmark. It requires a GNOME Shell build with headless support and the associated native tools, so it is separate from the default test command.
