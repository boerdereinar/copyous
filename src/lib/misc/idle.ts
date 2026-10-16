import GLib from 'gi://GLib';

import { ScheduleWork } from './workQueue.js';

export const scheduleIdle: ScheduleWork = (callback) => {
	const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
		callback();
		return GLib.SOURCE_REMOVE;
	});
	return () => GLib.source_remove(id);
};
