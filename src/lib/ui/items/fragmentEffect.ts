import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Shell from 'gi://Shell';

import { registerClass } from '../../common/gjs.js';

// Typings for Clutter.ShaderEffect API introduced in GNOME 51
declare class ShaderEffect51 extends Clutter.OffscreenEffect {
	set_uniform_float(name: string, nComponents: number, values: number[]): void;
	vfunc_get_static_snippet(): Cogl.Snippet;
}

export function createFragmentEffect(
	getShader: () => { declarations: string; code: string },
): new () => Clutter.OffscreenEffect & { setUniform(name: string, values: number[]): void } {
	if (!Shell.GLSLEffect) {
		const ShaderEffect = (Clutter as unknown as { ShaderEffect: typeof ShaderEffect51 }).ShaderEffect;
		@registerClass()
		class CopyousFragmentEffect51 extends ShaderEffect {
			override vfunc_get_static_snippet(): Cogl.Snippet {
				const { declarations, code } = getShader();
				const snippet = Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, declarations, null);
				snippet.set_replace(code);
				return snippet;
			}

			setUniform(name: string, values: number[]) {
				this.set_uniform_float(name, values.length, values);
			}
		}
		return CopyousFragmentEffect51;
	}

	@registerClass()
	class CopyousFragmentEffectLegacy extends Shell.GLSLEffect {
		override vfunc_build_pipeline(): void {
			const { declarations, code } = getShader();
			this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, declarations, code, true);
		}

		setUniform(name: string, values: number[]) {
			this.set_uniform_float(this.get_uniform_location(name), values.length, values);
		}
	}
	return CopyousFragmentEffectLegacy;
}
