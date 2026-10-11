import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';

import { registerClass } from '../../common/gjs.js';

// Based on https://gitlab.gnome.org/GNOME/mutter/-/blob/8b5c757bea75b7712bbe09c2018a8eb15b4d22cc/src/compositor/meta-background-content.c
const dec = `
	uniform sampler2D tex;
	uniform vec2 size;
	uniform vec4 hole_box;

	float circle_bounds(vec2 p, vec2 center, float radius) {
		vec2 delta = p - center;
		float dist_squared = dot(delta, delta);
		float dist = sqrt(dist_squared);

		float outer_radius = radius + 0.5;
		if (dist >= outer_radius)
			return 1.0;

		float inner_radius = radius - 0.5;
		if (dist <= inner_radius)
			return 0.0;

		return dist - inner_radius;
	}

	float rounded_rect_coverage(vec2 p, vec4 bounds, float radius) {
		if (p.x < bounds.x || p.x > bounds.z || p.y < bounds.y || p.y > bounds.w)
			return 1.0;

		vec2 center;

		float center_left = bounds.x + radius;
		float center_right = bounds.z - radius;

		if (p.x < center_left)
			center.x = center_left;
		else if (p.x > center_right)
			center.x = center_right;
		else
			return 0.0;

		center.y = bounds.y + radius;

		return circle_bounds(p, center, radius);
	}`;

const src = `
	vec2 uv = cogl_tex_coord_in[0].xy;
	vec2 p = size * cogl_tex_coord_in[0].xy;
	vec4 c = cogl_color_in * texture2D(tex, uv);

	if (hole_box.z <= 2.0 || hole_box.w <= 2.0) {
		cogl_color_out = c;
		return;
	}

	float radius = hole_box.w / 2.0;
	vec4 bounds = vec4(hole_box.x, hole_box.y, hole_box.x + hole_box.z, hole_box.y + hole_box.w);
	float alpha = rounded_rect_coverage(p, bounds, radius);
	cogl_color_out = vec4(c.rgb * alpha, min(alpha, c.a));`;

type HoleEffectBaseType = new () => Shell.GLSLEffect & {
	setUniform(name: string, n_components: number, value: number[]): void;
};

let HoleEffectBase: HoleEffectBaseType;
if (Shell.GLSLEffect) {
	HoleEffectBase = class extends Shell.GLSLEffect {
		override vfunc_build_pipeline() {
			this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, dec, src, true);
		}

		setUniform(name: string, n_components: number, value: number[]) {
			this.set_uniform_float(this.get_uniform_location(name), n_components, value);
		}
	};
} else {
	HoleEffectBase = class extends Clutter.ShaderEffect {
		vfunc_get_static_snippet(): Cogl.Snippet {
			const snippet = Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, dec, null);
			snippet.set_replace(src);
			return snippet;
		}

		setUniform(name: string, n_components: number, value: number[]) {
			type ShaderEffect = this & {
				set_uniform_float(name: string, n_components: number, value: number[]): void;
			};
			(this as ShaderEffect).set_uniform_float(name, n_components, value);
		}
	} as unknown as HoleEffectBaseType;
}

GObject.registerClass(HoleEffectBase);

@registerClass()
export class HoleEffect extends HoleEffectBase {
	constructor(private target: Clutter.Actor) {
		super();

		target.connect('notify::allocation', () => this.queue_repaint());
	}

	override vfunc_paint_target(node: Clutter.PaintNode, paintContext: Clutter.PaintContext) {
		const size = this.actor.get_transformed_size();
		this.setUniform('size', 2, size);

		const position = this.target.apply_relative_transform_to_point(this.actor, new Graphene.Point3D());
		const [width, height] = this.target.get_transformed_size();
		const holeBox = [position.x - 1.5, position.y + 1, width + 2, height + 1];
		this.setUniform('hole_box', 4, holeBox);

		super.vfunc_paint_target(node, paintContext);
	}
}
