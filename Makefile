# Constants
NAME := copyous
UUID := copyous@boerdereinar.dev

# Directories
SRC_DIR := src
DIST_DIR := dist
DIST_ZIP := $(DIST_DIR)/$(UUID).zip

DIST_PATH := $(shell pwd)/$(DIST_DIR)
PO_PATH := $(shell pwd)/resources/po
ICONS_PATH := $(shell pwd)/resources/icons

DATABASE := $(DIST_PATH)/database/test.db

SRC = $(shell find $(SRC_DIR) -name '*.ts')

# Load variables in .env file
ifneq ($(RELEASE), 1)
-include .env
endif

# Default to test database
DBPATH ?= $(DATABASE)

# Disable test database if sqlite3 is not installed
ifeq ($(DBPATH),$(DATABASE))
ifeq (, $(shell command -V sqlite3))
	DBPATH :=
endif
endif

# Targets
.PHONY: all clean
.PHONY: database
.PHONY: lint
.PHONY: pot po check-pot check-po
.PHONY: build install uninstall
.PHONY: launch launch-profile launch-settings

# Default target
all: $(DIST_ZIP)

# Clean
clean:
	rm -rf $(DIST_DIR)

# Dist
$(DIST_DIR):
	@mkdir -p $@

# Database
database: | $(DIST_DIR)
ifeq ($(DBPATH),$(DATABASE))
	@rm -f $(DBPATH)
	@cp -r resources/database $(DIST_DIR)
	cat resources/database/database.sql | sed "s|{DIST_PATH}|$(DIST_PATH)|g" | sqlite3 $(DBPATH)
endif

# Lint
lint:
	pnpm exec eslint src --ext .ts
	pnpm exec prettier src resources/css --check

lint-fix:
	pnpm exec eslint src --ext .ts --fix
	pnpm exec prettier src resources/css --write

# Localization
resources/po/main.pot: $(SRC)
	find src -name '*.ts' \
	| xargs xgettext \
		--from-code=UTF-8 \
		--copyright-holder="Copyous" \
		--package-name="Copyous" \
		--language="javascript" \
		--output="$@"

POT := resources/po/main.pot
pot: $(POT)

resources/po/%.po: resources/po/main.pot
	msgmerge --backup=off -U $@ $<

PO := $(wildcard resources/po/*.po)
po: $(PO)

check-pot:
	find src -name '*.ts' \
	| xargs xgettext \
		--from-code=UTF-8 \
		--copyright-holder="Copyous" \
		--package-name="Copyous" \
		--language="javascript" \
		--output=- \
	| diff -q -I '^"POT-Creation-Date: .*' - resources/po/main.pot

check-po:
	find resources/po -name '*.po' -exec msgcmp --use-untranslated {} resources/po/main.pot \;

# Copy metadata
$(DIST_DIR)/metadata.json: resources/metadata.json | $(DIST_DIR)
	cp $< $@

# TypeScript
$(DIST_DIR)/extension.js: $(SRC) tsconfig.json | $(DIST_DIR)
	pnpm exec tsc
	@touch $@
ifeq ($(RELEASE),1)
# Remove code blocks commented with /* DEBUG-ONLY */ or lines ending with // DEBUG-ONLY
	find $(@D) -name '*.js' -exec perl -0777 -i -pe 's/^(\s*)\/\* DEBUG-ONLY \*\/(?:.|\n)*?^\1\}|\/\/ DEBUG-ONLY.*\n.*$$//gm' {} \;
# Format code to make it easier for EGO reviewers
	-pnpm exec eslint $(DIST_DIR) --config ./format.eslint.config.js --fix --cache --cache-location=$(DIST_DIR)/.eslintcache
	pnpm exec prettier $(DIST_DIR) --ignore-path= --log-level=warn --write --cache --cache-location=$(DIST_DIR)/.prettiercache
endif

TSC := $(DIST_DIR)/extension.js

# CSS
$(DIST_DIR)/css/stylesheet-%.css: resources/css/%.scss resources/css/_*.scss | $(DIST_DIR)
	@mkdir -p $(DIST_DIR)/css
	pnpm exec sass --no-source-map --load-path=resources/css/gnome-shell-sass --quiet-deps $<:$@
	sed -i -re ':a; s%(.*)/\*.*\*/%\1%; ta; /\/\*/ !b; N; ba' $@ # Remove multiline comments
	sed -i -e '/stage {/,/}/d' -e '/^$$/d' $@

$(DIST_DIR)/css/template-%.css: resources/css/_main.scss resources/css/_*.scss scripts/template/postcss.config.cjs | $(DIST_DIR)
	@mkdir -p $(DIST_DIR)/css
	VARIANT=$* pnpm exec postcss $< --config scripts/template | pnpm exec sass --no-source-map --stdin $@

CSS := $(DIST_DIR)/css/stylesheet-dark.css $(DIST_DIR)/css/stylesheet-light.css $(DIST_DIR)/css/template-dark.css $(DIST_DIR)/css/template-light.css

# Schemas
SCHEMAS := $(patsubst resources/schemas/%.gschema.xml,$(DIST_DIR)/schemas/%.gschema.xml,$(wildcard resources/schemas/*.gschema.xml))
ifneq ($(DEBUG_SCHEMA),)
DEBUG_SCHEMAS := $(patsubst %.gschema.xml,%.debug.gschema.xml,$(SCHEMAS))
endif

$(SCHEMAS): $(DIST_DIR)/schemas/%.gschema.xml: resources/schemas/%.gschema.xml | $(DIST_DIR)
	glib-compile-schemas --strict --dry-run $(<D)
	@mkdir -p $(@D)
	cp $< $@

$(DEBUG_SCHEMAS): $(DIST_DIR)/schemas/%.debug.gschema.xml: resources/schemas/%.gschema.xml | $(DIST_DIR)
	$(eval ESCAPED := $(subst .,\., $*))
	$(eval SLASHED := $(subst .,\/, $*))
	@sed -e 's/$(ESCAPED)/$(ESCAPED).debug/g' -e 's/$(SLASHED)/$(SLASHED)\/debug/g' $< > $@

# Resources
$(DIST_DIR)/resources.gresource: resources/resources.gresource.xml resources/css/prefs.css | $(DIST_DIR)
	glib-compile-resources --target=$@ --sourcedir=resources $<

$(DIST_DIR)/theme.gresource: resources/theme.gresource.xml $(CSS) | $(DIST_DIR)
	glib-compile-resources --target=$@ --sourcedir=$(@D) $<

RESOURCES := $(DIST_DIR)/resources.gresource $(DIST_DIR)/theme.gresource

# Build all
$(DIST_ZIP): $(DIST_DIR)/metadata.json $(TSC) $(CSS) $(SCHEMAS) $(DEBUG_SCHEMAS) $(RESOURCES) | $(DIST_DIR)
	gnome-extensions pack $(DIST_DIR) -o $(@D) \
		--force \
		--podir=$(PO_PATH) \
		--extra-source="lib" \
		--extra-source="thirdparty" \
		--extra-source=$(ICONS_PATH) \
		--extra-source="resources.gresource" \
		--extra-source="theme.gresource"
	@mv $(DIST_DIR)/$(UUID).shell-extension.zip $@

build: $(DIST_ZIP)

# Install
INSTALL_TARGET := $(or $(shell gnome-extensions info $(UUID) 2>/dev/null | awk -F': ' '/Path:/ {print $$2}'), install-new)
ifeq ($(INSTALL_TARGET),)
.PHONY = install-new
INSTALL_TARGET := install-new
endif

$(INSTALL_TARGET): $(DIST_ZIP)
	gnome-extensions install --force $<

install: $(INSTALL_TARGET)

uninstall:
	gnome-extensions uninstall $(UUID)

# Launch
HAS_DEVKIT := $(shell gnome-shell --help | grep -q -- --devkit && echo 1)
MUTTER_DEVKIT := $(wildcard $(or $(shell command -V mutter-devkit 2>/dev/null), /usr/libexec/mutter-devkit))

export MUTTER_DEBUG_DUMMY_MODE_SPECS=$(RESOLUTION)
export CLUTTER_TEXT_DIRECTION=$(TEXT_DIRECTION)
export DEBUG_COPYOUS_SCHEMA=$(DEBUG_SCHEMA)
export DEBUG_COPYOUS_DBPATH=$(DBPATH)
export DEBUG_COPYOUS_GDA_VERSION=$(GDA_VERSION)
export DEBUG_COPYOUS_ACTIONS=$(ACTIONS)

launch: install database
# Check for mutter-devkit
	$(if $(HAS_DEVKIT), $(if $(MUTTER_DEVKIT),,$(error mutter-devkit is not installed)))
# Load dconf settings
	@dconf reset -f /org/gnome/shell/extensions/$(NAME)/debug/
	@$(if $(filter-out default,$(DEBUG_SCHEMA)), cat $(DEBUG_SCHEMA) | dconf load /org/gnome/shell/extensions/$(NAME)/debug/)
# Run shell
	dbus-run-session -- gnome-shell $(if $(HAS_DEVKIT),--devkit,--nested) --wayland

# Open settings and show logs and dconf watch output while settings are open
launch-settings: install
	gnome-extensions prefs $(UUID)
	@journalctl -f --since "5 seconds ago" /usr/bin/gjs /usr/bin/gnome-shell + PRIORITY=0 PRIORITY=1 PRIORITY=2 PRIORITY=3 & JOURNAL_PID=$$!; \
	dconf watch /org/gnome/shell/extensions/$(NAME)/ & DCONF_PID=$$!; \
	PID=$$(pgrep -f "^/usr/bin/gjs -m /usr/share/gnome-shell/org.gnome.Shell.Extensions$$"); \
	trap 'kill $$JOURNAL_PID; kill $$DCONF_PID; kill $$PID; exit 0' TERM INT; \
    while kill -0 $$PID 2> /dev/null; do sleep .5; done; \
	kill $$JOURNAL_PID; kill $$DCONF_PID;
