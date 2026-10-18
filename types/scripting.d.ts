declare module 'resource:///org/gnome/shell/ui/scripting.js' {
	/**
	 * Used within an automation script to pause the execution of the
	 * current script for the specified amount of time. Use as
	 * 'yield Scripting.sleep(500);'
	 *
	 * @param {number} milliseconds - number of milliseconds to wait
	 * @returns {Promise} that resolves after @milliseconds ms
	 */
	export function sleep(milliseconds: number): Promise<void>;

	/**
	 * Used within an automation script to pause the execution of the
	 * current script until the shell is completely idle. Use as
	 * 'yield Scripting.waitLeisure();'
	 *
	 * @returns {Promise} that resolves when the shell is idle
	 */
	export function waitLeisure(): Promise<void>;

	/**
	 * Convenience function to define a zero-argument performance event
	 * within the 'script' namespace that is reserved for events defined locally
	 * within a performance automation script
	 *
	 * @param {string} name The event will be called script.<name>
	 * @param {string} description Short human-readable description of the event
	 */
	export function defineScriptEvent(name: string, description: string): void;

	/**
	 * Convenience function to record a script-local performance event
	 * previously defined with defineScriptEvent.
	 *
	 * @param {string} name Name registered with defineScriptEvent()
	 */
	export function scriptEvent(name: string);
}
