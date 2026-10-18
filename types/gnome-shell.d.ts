import type { LayoutManager } from '@girs/gnome-shell/ui/layout';

declare module '@girs/gnome-shell/ui/layout' {
	interface LayoutManager {
		emit(signal: 'system-modal-opened'): void;
	}
}

export type { LayoutManager };
