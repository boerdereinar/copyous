#!/usr/bin/env python3
"""Manual GNOME Shell smoke test using isolated XDG directories and synthetic history.

Run from the repository root after RELEASE=1 make build. Requires GNOME Shell
headless support, dbus-run-session, GSettings, and glib-compile-schemas.
Logs and fixtures remain in the printed temporary directory for inspection.
"""

import json, os, pathlib, re, shutil, signal, subprocess, tempfile, zipfile
from datetime import datetime, timezone

root = pathlib.Path(tempfile.mkdtemp(prefix="copyous-shell-audit-"))
ext = root / "data/gnome-shell/extensions/copyous@boerdereinar.dev"
ext.mkdir(parents=True)
with zipfile.ZipFile("dist/copyous@boerdereinar.dev.zip") as z:
    z.extractall(ext)
# Instrument only the isolated test artifact: verify the actual native actor tree
# after startup history is flushed, before each dialog opening.
dialog = ext / "lib/ui/clipboardDialog.js"
source = dialog.read_text()
needle = "this._historyLoader.flush();"
assert needle in source
source = source.replace(needle, needle + """
        {
            const container = this._scrollView._scrollContainer;
            const status = container._statusItem;
            const hasItems = container.get_children().some(child => child !== status && child.visible);
            if (hasItems && status.get_parent() !== null)
                throw new Error('Copyous test: empty status displayed alongside history');
            if (hasItems) console.log('Copyous test: history status invariant passed');
        }
""", 1)
dialog.write_text(source)
subprocess.run(["glib-compile-schemas", str(ext / "schemas")], check=True)
public_hljs = (
    pathlib.Path.home() / ".local/share/copyous@boerdereinar.dev/highlight.min.js"
)
if public_hljs.exists():
    shutil.copy(public_hljs, ext / "highlight.min.js")
for d in ["config", "cache", "runtime"]:
    (root / d).mkdir(mode=0o700)
notes = root / "notes.js"
notes.write_text("const answer = 42;\nconsole.log(answer);\n")
image = root / "image.svg"
shutil.copy("resources/database/image.svg", image)
large = root / "large-image.svg"
shutil.copy("resources/database/large-image.svg", large)
entries = []
for i in range(300):
    kind = ["Text", "Code", "Character", "Color", "File", "Image", "Files", "Link"][
        i % 8
    ]
    content = {
        "Text": f"Synthetic history entry {i}",
        "Code": f"const value{i} = {i};\nconsole.log(value{i});",
        "Character": "λ",
        "Color": "#47a4ba",
        "File": notes.as_uri(),
        "Image": (large if i % 16 == 5 else image).as_uri(),
        "Files": notes.as_uri() + "\n" + image.as_uri(),
        "Link": f"https://example.invalid/synthetic/{i}",
    }[kind]
    # Distinct text/code/link entries plus repeated media exercise shared cached resources.
    metadata = (
        {"language": {"id": "javascript", "name": "JavaScript"}}
        if kind == "Code"
        else {
            "title": f"Synthetic link {i}",
            "description": "Local test metadata",
            "image": None,
        }
        if kind == "Link"
        else None
    )
    entries.append(
        dict(
            type=kind,
            content=content,
            pinned=True,
            tag=None,
            datetime=datetime.now(timezone.utc).isoformat(),
            metadata=metadata,
            title=f"Test {i}",
        )
    )
(root / "history.json").write_text(json.dumps(dict(version=2, entries=entries)))
script = root / "run.sh"
script.write_text("""#!/bin/bash
set -eu
root="$1"
export GSETTINGS_SCHEMA_DIR="$root/data/gnome-shell/extensions/copyous@boerdereinar.dev/schemas"
gsettings set org.gnome.shell enabled-extensions "['copyous@boerdereinar.dev']"
gsettings set org.gnome.shell.extensions.copyous database-backend json
gsettings set org.gnome.shell.extensions.copyous database-location "$root/history.json"
gsettings set org.gnome.shell.extensions.copyous clipboard-history keep-all
gsettings set org.gnome.shell.extensions.copyous history-length 500
gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x720 --debug-control >"$root/shell.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT
ready=0
for attempt in $(seq 1 100); do
    if gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.GetExtensionInfo copyous@boerdereinar.dev >"$root/info.log" 2>/dev/null && grep -q "'state': <1" "$root/info.log"; then ready=1; break; fi
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 0.2
done
if [ "$ready" != 1 ]; then cat "$root/shell.log"; exit 1; fi
for orientation in horizontal vertical horizontal; do
    gsettings set org.gnome.shell.extensions.copyous clipboard-orientation "$orientation"
    gdbus call --session --dest org.gnome.Shell.Extensions.Copyous --object-path /org/gnome/Shell/Extensions/Copyous --method org.gnome.Shell.Extensions.Copyous.Show
    sleep 0.4
    gdbus call --session --dest org.gnome.Shell.Extensions.Copyous --object-path /org/gnome/Shell/Extensions/Copyous --method org.gnome.Shell.Extensions.Copyous.Hide
    sleep 0.3
done
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.GetExtensionErrors copyous@boerdereinar.dev >"$root/errors.log"
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.DisableExtension copyous@boerdereinar.dev
sleep 0.3
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.EnableExtension copyous@boerdereinar.dev
sleep 0.5
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.GetExtensionInfo copyous@boerdereinar.dev >"$root/final-info.log"
sleep 1
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.DisableExtension copyous@boerdereinar.dev
cat "$root/errors.log" "$root/final-info.log"
""")
env = os.environ.copy()
for key in [
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "SESSION_MANAGER",
    "DBUS_SESSION_BUS_ADDRESS",
    "DBUS_STARTER_ADDRESS",
    "DBUS_STARTER_BUS_TYPE",
]:
    env.pop(key, None)
env.update(
    XDG_DATA_HOME=str(root / "data"),
    XDG_CONFIG_HOME=str(root / "config"),
    XDG_CACHE_HOME=str(root / "cache"),
    XDG_RUNTIME_DIR=str(root / "runtime"),
    XDG_SESSION_TYPE="wayland",
    XDG_CURRENT_DESKTOP="GNOME",
    LIBGL_ALWAYS_SOFTWARE="1",
)
print("Isolated test directory:", root, flush=True)
process = subprocess.Popen(
    ["dbus-run-session", "--", "bash", str(script), str(root)],
    env=env,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    start_new_session=True,
)
try:
    output, _ = process.communicate(timeout=45)
except subprocess.TimeoutExpired:
    os.killpg(process.pid, signal.SIGTERM)
    output, _ = process.communicate(timeout=10)
    (root / "runner.log").write_text(output)
    raise SystemExit("Headless smoke test timed out; inspect the printed log directory")
(root / "runner.log").write_text(output)
final_info = (
    (root / "final-info.log").read_text() if (root / "final-info.log").exists() else ""
)
if "'state': <1" not in final_info:
    print(output[-3000:])
    raise SystemExit("Extension did not reactivate successfully")
shell_log = (root / "shell.log").read_text() if (root / "shell.log").exists() else ""
errors = [
    line
    for line in shell_log.splitlines()
    if re.search(r"Gjs-CRITICAL|GLib-GObject-CRITICAL|JS ERROR:", line)
    and not ("ImportError" in line and "highlight.min.js" in line)
]
if "Copyous test: history status invariant passed" not in shell_log:
    raise SystemExit("History status invariant was not exercised")
if process.returncode or errors:
    print("\n".join(errors[:20]) if errors else output[-3000:])
    raise SystemExit("Headless smoke test failed; inspect the printed log directory")
print(
    "Headless GNOME smoke test passed: mixed history, both orientations, disable/re-enable, no unexpected JS errors."
)
