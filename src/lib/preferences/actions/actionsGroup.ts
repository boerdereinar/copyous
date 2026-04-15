import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
	type Action,
	type ActionSubmenu,
	instanceofAction,
	instanceofActionSubmenu,
	instanceofCommandAction,
} from '../../common/actions.js';
import { JsObjectWrapper, registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { NestedListBox } from '../utils.js';
import { AddActionDialog, EditActionDialog, TypesBox } from './actionDialog.js';
import { AddActionSubmenuDialog, EditActionSubmenuDialog } from './actionSubMenuDialog.js';

Gio._promisify(Adw.AlertDialog.prototype, 'choose');

const ShortcutLabel = ('ShortcutLabel' in Gtk && !('ShortcutLabel' in Adw) ? (Gtk as typeof Adw) : Adw).ShortcutLabel;

@registerClass()
class DeleteDialog extends Adw.AlertDialog {
	constructor(props: Partial<Adw.AlertDialog.ConstructorProps>) {
		super(props);

		this.add_response('cancel', _('Cancel'));
		this.add_response('delete', _('Delete'));
		this.close_response = 'delete';
		this.default_response = 'cancel';
		this.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
	}
}

@registerClass({
	Properties: {
		'action-submenu': GObject.ParamSpec.jsobject('action-submenu', null, null, GObject.ParamFlags.READABLE),
	},
})
class ActionSubmenuRowBase extends Adw.ExpanderRow {
	protected readonly _menuButton: Gtk.MenuButton;

	constructor(public readonly actionSubmenu: ActionSubmenu) {
		super({
			title: actionSubmenu.name,
		});

		const dragHandle = new Gtk.Image({
			icon_name: Icon.DragHandle,
			valign: Gtk.Align.CENTER,
		});
		this.add_prefix(dragHandle);

		this._menuButton = new Gtk.MenuButton({
			icon_name: Icon.ViewMore,
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
		});
		this.add_suffix(this._menuButton);
	}
}

@registerClass({
	Signals: {
		delete: {},
	},
})
class ActionSubmenuRow extends ActionSubmenuRowBase {
	private readonly _actionsList: NestedListBox;
	private readonly _addActionButtonList: NestedListBox;
	private readonly _addActionButton: Adw.ActionRow;

	constructor(
		private window: Adw.PreferencesWindow,
		actionSubmenu: ActionSubmenu,
	) {
		super(actionSubmenu);

		// Nested lists
		this._actionsList = new NestedListBox();
		this.add_row(this._actionsList);
		this._actionsList.listbox.add_css_class('has-placeholder');
		this._actionsList.listbox.set_placeholder(
			new Adw.ActionRow({
				title: _('No Actions'),
				sensitive: false,
			}),
		);

		this._addActionButtonList = new NestedListBox();
		this.add_row(this._addActionButtonList);

		this._addActionButton = new Adw.ActionRow({
			title: _('Add Action'),
			activatable: true,
		});
		this._addActionButton.add_prefix(new Gtk.Image({ icon_name: Icon.Add }));
		this._addActionButton.connect('activated', this.add.bind(this));
		this._addActionButtonList.listbox.append(this._addActionButton);

		// Populate actions
		for (const action of this.actionSubmenu.actions) {
			this._actionsList.listbox.append(this.createRow(action));
		}

		// Menu
		const actionGroup = new Gio.SimpleActionGroup();

		const editAction = Gio.SimpleAction.new('edit', null);
		editAction.connect('activate', this.edit.bind(this));
		actionGroup.add_action(editAction);

		const deleteAction = Gio.SimpleAction.new('delete', null);
		deleteAction.connect('activate', this.delete.bind(this));
		actionGroup.add_action(deleteAction);

		this._menuButton.insert_action_group('action', actionGroup);

		const menu = new Gio.Menu();
		menu.append(_('Edit'), 'action.edit');
		menu.append(_('Delete'), 'action.delete');
		this._menuButton.menu_model = menu;

		// Drag and Drop
		this.configureDragAndDrop();
	}

	private createRow(action: Action): ActionRow {
		const row = new ActionRow(this.window, action);

		row.connect('notify::action', () => this.notify('action-submenu'));
		row.connect('delete', () => {
			this._actionsList.listbox.remove(row);
			this.updateActionSubmenu();
		});

		return row;
	}

	private updateActionSubmenu() {
		const actions = [];
		let child = this._actionsList.listbox.get_first_child();
		while (child) {
			if (child instanceof ActionRow) actions.push(child.action);
			child = child.get_next_sibling();
		}

		this.actionSubmenu.actions = actions;
		this.notify('action-submenu');
	}

	private async add() {
		const addActionDialog = new AddActionDialog(null);

		const response = await addActionDialog.choose(this.window, null);
		if (response !== 'add' || addActionDialog.action === null) return;

		this._actionsList.listbox.append(this.createRow(addActionDialog.action));
		this.actionSubmenu.actions.push(addActionDialog.action);
		this.notify('action-submenu');
	}

	private async edit() {
		const editSubmenuDialog = new EditActionSubmenuDialog(this.actionSubmenu);

		const response = await editSubmenuDialog.choose(this.window, null);
		if (response !== 'edit') return;

		this.title = this.actionSubmenu.name;
		this.notify('action-submenu');
	}

	private async delete() {
		const deleteSubmenuDialog = new DeleteDialog({
			heading: _('Delete Submenu?'),
			body: _('Deleting the submenu will delete all actions in the submenu'),
		});

		const response = await deleteSubmenuDialog.choose(this.window, null);
		if (response !== 'delete') return;

		this.emit('delete');
	}

	private configureDragAndDrop() {
		// Drag
		const dropController = new Gtk.DropControllerMotion();
		const addActionDropController = new Gtk.DropControllerMotion();
		const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });

		const expanderRow = this.child.get_first_child()?.get_first_child() as Adw.ActionRow;
		expanderRow.add_controller(dropController);
		expanderRow.add_controller(dragSource);
		this._addActionButton.add_controller(addActionDropController);

		let dragX = 0;
		let dragY = 0;
		dragSource.connect('prepare', (_source, x, y) => {
			dragX = x;
			dragY = y;

			this.expanded = false;

			const value = new GObject.Value();
			value.init(ActionSubmenuRow.$gtype);
			value.set_object(this);

			return Gdk.ContentProvider.new_for_value(value);
		});

		dragSource.connect('drag-begin', (_source, drag) => {
			const dragWidget = new Gtk.ListBox({
				css_classes: ['boxed-list'],
				width_request: this.get_width(),
			});

			const dragRow = new ActionSubmenuRowBase(this.actionSubmenu);
			dragWidget.append(dragRow);
			dragWidget.drag_highlight_row(dragRow);

			const icon = Gtk.DragIcon.get_for_drag(drag);
			icon.child = dragWidget;

			drag.set_hotspot(dragX, dragY);
		});

		dragSource.connect('drag-end', (_source, _drag, deleteData) => {
			if (deleteData) this.emit('delete');
		});

		// Update drag
		let sourceId: number = -1;
		dropController.connect('enter', () => {
			(expanderRow.parent as Gtk.ListBox).drag_highlight_row(expanderRow);

			if (!this.expanded && sourceId === -1) {
				sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
					this.expanded = true;
					sourceId = -1;
					return GLib.SOURCE_REMOVE;
				});
			}
		});

		dropController.connect('leave', () => {
			(expanderRow.parent as Gtk.ListBox).drag_unhighlight_row();

			if (sourceId >= 0) {
				GLib.source_remove(sourceId);
				sourceId = -1;
			}
		});

		addActionDropController.connect('enter', () =>
			this._addActionButtonList.listbox.drag_highlight_row(this._addActionButton),
		);
		addActionDropController.connect('leave', () => this._addActionButtonList.listbox.drag_unhighlight_row());

		// Drop
		const dropTarget = Gtk.DropTarget.new(ActionRow.$gtype, Gdk.DragAction.MOVE);
		this._actionsList.listbox.add_controller(dropTarget);

		dropTarget.connect('drop', (_drop, row: ActionRow, _x, y) => {
			const targetRow = this._actionsList.listbox.get_row_at_y(y);
			if (!row || !targetRow || row === targetRow) return false;
			let targetIndex = targetRow.get_index();
			if (row.parent === this._actionsList.listbox && row.get_index() < targetIndex) targetIndex++;

			this._actionsList.listbox.insert(this.createRow(row.action), targetIndex);
			this.updateActionSubmenu();
			targetRow.set_state_flags(Gtk.StateFlags.NORMAL, true);

			return true;
		});

		const addActionDropTarget = Gtk.DropTarget.new(ActionRow.$gtype, Gdk.DragAction.MOVE);
		this._addActionButtonList.listbox.add_controller(addActionDropTarget);

		addActionDropTarget.connect('drop', (_drop, row: ActionRow, _x, _y) => {
			if (!row) return false;

			this._actionsList.listbox.append(this.createRow(row.action));
			this.updateActionSubmenu();
			this._addActionButton.set_state_flags(Gtk.StateFlags.NORMAL, true);

			return true;
		});
	}
}

@registerClass({
	Properties: {
		action: GObject.ParamSpec.jsobject('action', null, null, GObject.ParamFlags.READABLE),
	},
})
class ActionRowBase extends Adw.PreferencesRow {
	protected readonly _menuButton: Gtk.MenuButton;
	protected readonly _nameLabel: Gtk.Label;
	protected readonly _patternLabel: Gtk.Label;
	protected readonly _actionLabel: Gtk.Label;
	protected readonly _shortcutLabel: Adw.ShortcutLabel;
	protected readonly _typesBox: TypesBox;

	constructor(public readonly action: Action) {
		super();

		const header = new Gtk.Box({
			valign: Gtk.Align.CENTER,
			hexpand: false,
			css_classes: ['header'],
		});
		this.child = header;

		// Drag handle
		const prefixes = new Gtk.Box({ css_classes: ['prefixes'] });
		header.append(prefixes);

		const dragHandle = new Gtk.Image({
			icon_name: Icon.DragHandle,
			valign: Gtk.Align.CENTER,
		});
		prefixes.append(dragHandle);

		// Content
		const box = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			valign: Gtk.Align.CENTER,
			hexpand: true,
			css_classes: ['title'],
		});
		header.append(box);

		const titleBox = new Gtk.Box();
		box.append(titleBox);

		// Name
		this._nameLabel = new Gtk.Label({
			label: action.name,
			xalign: 0,
			ellipsize: Pango.EllipsizeMode.END,
			css_classes: ['title'],
		});
		titleBox.append(this._nameLabel);

		// Pattern
		this._patternLabel = new Gtk.Label({
			label: action.pattern ?? '',
			xalign: 0,
			yalign: 1,
			margin_start: 12,
			ellipsize: Pango.EllipsizeMode.END,
			css_classes: ['subtitle'],
		});
		titleBox.append(this._patternLabel);

		// Action
		this._actionLabel = new Gtk.Label({
			label: instanceofCommandAction(action) ? action.command : '',
			xalign: 0,
			ellipsize: Pango.EllipsizeMode.END,
			css_classes: ['subtitle'],
			visible: instanceofCommandAction(action),
		});
		box.append(this._actionLabel);

		// Shortcut
		this._shortcutLabel = new ShortcutLabel({
			accelerator: action.shortcut?.[0] ?? '',
			valign: Gtk.Align.CENTER,
			margin_end: 6,
		});
		header.append(this._shortcutLabel);

		// Type icons
		this._typesBox = new TypesBox();
		this._typesBox.types = action.types ?? [];
		header.append(this._typesBox);

		// Menu button
		const suffixes = new Gtk.Box();
		header.append(suffixes);

		this._menuButton = new Gtk.MenuButton({
			icon_name: Icon.ViewMore,
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
		});
		suffixes.append(this._menuButton);
	}
}

@registerClass({
	Signals: {
		delete: {},
	},
})
class ActionRow extends ActionRowBase {
	constructor(
		private window: Adw.PreferencesWindow,
		action: Action,
	) {
		super(action);

		// Menu
		const actionGroup = new Gio.SimpleActionGroup();

		const editAction = Gio.SimpleAction.new('edit', null);
		editAction.connect('activate', this.edit.bind(this));
		actionGroup.add_action(editAction);

		const deleteAction = Gio.SimpleAction.new('delete', null);
		deleteAction.connect('activate', this.delete.bind(this));
		actionGroup.add_action(deleteAction);

		this._menuButton.insert_action_group('action', actionGroup);

		const menu = new Gio.Menu();
		menu.append(_('Edit'), 'action.edit');
		menu.append(_('Delete'), 'action.delete');
		this._menuButton.menu_model = menu;

		// Drag and drop
		this.configureDragAndDrop();
	}

	private async edit() {
		const editActionDialog = new EditActionDialog(this.action);

		const response = await editActionDialog.choose(this.window, null);
		if (response !== 'save') return;

		this._nameLabel.label = this.action.name;
		this._patternLabel.label = this.action.pattern ?? '';
		this._actionLabel.label = instanceofCommandAction(this.action) ? this.action.command : '';
		this._shortcutLabel.accelerator = this.action.shortcut?.[0] ?? '';
		this._typesBox.types = this.action.types ?? [];
		this.notify('action');
	}

	private async delete() {
		const deleteActionDialog = new DeleteDialog({ heading: _('Delete Action?') });

		const response = await deleteActionDialog.choose(this.window, null);
		if (response !== 'delete') return;

		this.emit('delete');
	}

	private configureDragAndDrop() {
		const dropController = new Gtk.DropControllerMotion();
		const dragSource = new Gtk.DragSource({
			actions: Gdk.DragAction.MOVE,
		});

		this.add_controller(dropController);
		this.add_controller(dragSource);

		// Drag
		let dragX = 0;
		let dragY = 0;
		dragSource.connect('prepare', (_source, x, y) => {
			dragX = x;
			dragY = y;

			const value = new GObject.Value();
			value.init(ActionRow.$gtype);
			value.set_object(this);

			return Gdk.ContentProvider.new_for_value(value);
		});

		dragSource.connect('drag-begin', (_source, drag) => {
			const dragWidget = new Gtk.ListBox({
				css_classes: ['boxed-list'],
				width_request: this.get_width(),
				height_request: this.get_height(),
			});

			const dragRow = new ActionRowBase(this.action);
			dragWidget.append(dragRow);
			dragWidget.drag_highlight_row(dragRow);

			const icon = Gtk.DragIcon.get_for_drag(drag);
			icon.child = dragWidget;

			drag.set_hotspot(dragX, dragY);
		});

		dragSource.connect('drag-end', (_source, _drag, deleteData) => {
			if (deleteData) this.emit('delete');
		});

		// Update drag
		dropController.connect('enter', () => (this.parent as Gtk.ListBox)?.drag_highlight_row(this));
		dropController.connect('leave', () => (this.parent as Gtk.ListBox)?.drag_unhighlight_row());
	}
}

@registerClass({
	Properties: {
		actions: GObject.ParamSpec.jsobject('actions', null, null, GObject.ParamFlags.READABLE),
	},
})
export class ActionsGroup extends Adw.PreferencesGroup {
	private _actions: (Action | ActionSubmenu)[] = [];
	private readonly _model: Gio.ListStore<JsObjectWrapper<Action | ActionSubmenu>>;
	private readonly _listbox: Gtk.ListBox;

	constructor(
		private window: Adw.PreferencesWindow,
		actions: (Action | ActionSubmenu)[],
	) {
		super({ title: _('Actions') });

		this._actions = actions.filter((a) => instanceofAction(a) || instanceofActionSubmenu(a));

		// List
		this._listbox = new Gtk.ListBox({
			css_classes: ['boxed-list', 'has-placeholder'],
			selection_mode: Gtk.SelectionMode.NONE,
		});
		this._listbox.set_placeholder(
			new Adw.ActionRow({
				title: _('No Actions'),
				sensitive: false,
			}),
		);
		this.add(this._listbox);

		// Populate Actions and Submenus
		const jsobjects = actions.map((a) => new JsObjectWrapper(a));
		this._model = Gio.ListStore.new(JsObjectWrapper.$gtype) as Gio.ListStore<
			JsObjectWrapper<Action | ActionSubmenu>
		>;
		this._model.splice(0, 0, jsobjects);

		this._listbox.bind_model(this._model, this.createRow.bind(this));

		// Menu
		const addActionButton = new Gtk.MenuButton({
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
			child: new Adw.ButtonContent({
				icon_name: Icon.Add,
				label: _('Add'),
			}),
		});
		this.header_suffix = addActionButton;

		const actionGroup = new Gio.SimpleActionGroup();

		const addAction = Gio.SimpleAction.new('add-action', null);
		addAction.connect('activate', this.addAction.bind(this));
		actionGroup.add_action(addAction);

		const addSubmenu = Gio.SimpleAction.new('add-sub-menu', null);
		addSubmenu.connect('activate', this.addSubmenu.bind(this));
		actionGroup.add_action(addSubmenu);

		addActionButton.insert_action_group('action-menu', actionGroup);

		const menu = new Gio.Menu();
		menu.append(_('Add Action'), 'action-menu.add-action');
		menu.append(_('Add Submenu'), 'action-menu.add-sub-menu');
		addActionButton.menu_model = menu;

		// Drag and drop
		this.configureDragAndDrop();
	}

	get actions() {
		return this._actions;
	}

	set actions(actions: (Action | ActionSubmenu)[]) {
		this._actions = actions;
		const jsobjects = actions.map((a) => new JsObjectWrapper(a));
		this._model.splice(0, this._model.n_items, jsobjects);
		this.notify('actions');
	}

	private createRow(action: JsObjectWrapper<Action | ActionSubmenu>): ActionRow | ActionSubmenuRow {
		const row = instanceofAction(action.jsobject)
			? new ActionRow(this.window, action.jsobject)
			: instanceofActionSubmenu(action.jsobject)
				? new ActionSubmenuRow(this.window, action.jsobject)
				: null!;

		if (row instanceof ActionRow) {
			row.connect('notify::action', this.updateActions.bind(this));
		} else {
			row.connect('notify::action-submenu', this.updateActions.bind(this));
		}

		row.connect('delete', () => {
			const [success, index] = this._model.find(action);
			if (!success) return;

			this._model.splice(index, 1, []);
			this.updateActions();
		});

		return row;
	}

	private updateActions() {
		this._actions = Array.from(this._model).map((obj) => obj.jsobject);
		this.notify('actions');
	}

	private async addAction() {
		const addActionDialog = new AddActionDialog(null);

		const response = await addActionDialog.choose(this.window, null);
		if (response !== 'add' || addActionDialog.action === null) return;

		this._actions.push(addActionDialog.action);
		this._model.append(new JsObjectWrapper(addActionDialog.action));
		this.notify('actions');
	}

	private async addSubmenu() {
		const addActionSubmenuDialog = new AddActionSubmenuDialog(null);

		const response = await addActionSubmenuDialog.choose(this.window, null);
		if (response !== 'add') return;

		this._actions.push(addActionSubmenuDialog.actionSubmenu);
		this._model.append(new JsObjectWrapper(addActionSubmenuDialog.actionSubmenu));
		this.notify('actions');
	}

	private configureDragAndDrop() {
		// Drop
		const dropTarget = Gtk.DropTarget.new(GObject.TYPE_NONE, Gdk.DragAction.MOVE);
		dropTarget.set_gtypes([ActionRow.$gtype, ActionSubmenuRow.$gtype]);
		this._listbox.add_controller(dropTarget);

		dropTarget.connect('drop', (_drop, row: ActionRow | ActionSubmenuRow, _x, y) => {
			const targetRow = this._listbox.get_row_at_y(y);
			if (!row || !targetRow) return false;
			let targetIndex = targetRow.get_index();
			if (row.parent === this._listbox && row.get_index() < targetIndex) targetIndex++;

			const action = row instanceof ActionRow ? row.action : row.actionSubmenu;
			const jsobject = new JsObjectWrapper(action);
			this._model.insert(targetIndex, jsobject);
			targetRow.set_state_flags(Gtk.StateFlags.NORMAL, true);
			this._actions.push(action);
			this.notify('actions');

			return true;
		});
	}
}
