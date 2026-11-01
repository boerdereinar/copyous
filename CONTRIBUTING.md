# Contributing
## Pull Requests
- Name pull requests using the imperative mood (i.e. "Add feature", or "Fix bug").
- Each pull request should focus on a single, clear change.
- All pull requests are squashed and merged, so ensure your pull request accurately summarizes the change.

## Code Style
This project uses [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/) for linting and formatting.

You can lint and format your code by running:
```shell
make lint-fix
```

## Development
### Configuration
Copy `.env.template` to `.env` and set any necessary environment variables which will be loaded in the Makefile.
```shell
cp .env.template .env
```

### Debugging
> [!IMPORTANT]
> GNOME Shell 49 and above requires mutter-devkit to be installed to run a GNOME Shell instance.
> <details>
> <summary>Install Mutter Devkit</summary>
>
> | Distro        | Command                            |
> |---------------|------------------------------------|
> | Fedora        | `sudo dnf install mutter-devel`    |
> | Arch Linux    | `sudo pacman -S mutter-devkit`     |
> | Ubuntu/Debian | `sudo apt install mutter-dev-bin`  |
> | openSUSE      | `sudo zypper install mutter-devel` |
> </details>

#### Extension
Install the extension and run a nested GNOME Shell instance for development and testing.
```shell
make launch
```

#### Settings
Install the extension and launch extension settings while also observing gjs/gnome-shell logs and dconf changes.
```shell
make launch-settings
```

#### Toolbox
Create the toolbox once with the fedora version you want to test:
```shell
./scripts/toolbox/create-toolbox.sh --version 45
```

Then launch GNOME Shell in it:
```shell
make launch-toolbox
```

Remove the toolbox with `toolbox rm copyous-devel` when it is no longer needed.

### Useful Resources
- https://gjs.guide/extensions/
- https://gjs-docs.gnome.org/
- https://gitlab.gnome.org/GNOME/gnome-shell/-/tree/main/js
