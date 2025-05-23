// Import TypeScript modules
import type { Point } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/types.mjs";
import type { LancerToken } from "../token";

/**
 * Sets user targets to tokens that are within the highlighted spaces of the
 * MeasuredTemplate
 * @param templateId - The id of the template to use
 */
export function targetsFromTemplate(templateId: string): void {
  const template = canvas.scene?.getEmbeddedDocument("MeasuredTemplate", templateId, {}) as any;
  const grid = canvas?.grid;
  if (template === undefined || canvas === undefined || grid === undefined || canvas.ready !== true) return;
  let test_token: (t: LancerToken) => boolean;
  if (canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS) {
    test_token = (token: LancerToken) => {
      const token_radius = token.document.width! / 2;
      // @ts-expect-error v12 grid
      const range: number = canvas.grid!.measurePath([token.center, template]).distance;

      if (template.t === "circle") {
        return range <= token_radius + template.distance;
      }
      if (template.t === "cone") {
        let sd = template.object.ray.distance as number;
        let s1 = Ray.fromAngle(
          template.object.ray.A.x,
          template.object.ray.A.y,
          Math.toRadians(template.direction + template.angle / 2),
          sd
        );
        let s2 = Ray.fromAngle(
          template.object.ray.A.x,
          template.object.ray.A.y,
          Math.toRadians(template.direction - template.angle / 2),
          sd
        );
        return (
          range <= template.distance + token_radius &&
          (in_cone_arc(template.object.ray, Math.toRadians(template.angle), token.center) ||
            min_dist(s1, token.center) < token_radius * canvas.dimensions!.size ||
            min_dist(s2, token.center) < token_radius * canvas.dimensions!.size)
        );
      }
      if (template.t === "ray") {
        let o1 = Ray.fromAngle(
          template.object.ray.A.x,
          template.object.ray.A.y,
          template.object.ray.angle - Math.PI / 2,
          template.width * canvas.dimensions!.size
        );
        let r1 = Ray.fromAngle(o1.B.x, o1.B.y, template.object.ray.angle, template.object.ray.distance);
        let o2 = Ray.fromAngle(
          template.object.ray.A.x,
          template.object.ray.A.y,
          template.object.ray.angle + Math.PI / 2,
          template.width * canvas.dimensions!.size
        );
        let r2 = Ray.fromAngle(o2.B.x, o2.B.y, template.object.ray.angle, template.object.ray.distance);
        return (
          range <= template.distance + token_radius &&
          (min_dist(r1, token.center) < token_radius * canvas.dimensions!.size ||
            min_dist(r2, token.center) < token_radius * canvas.dimensions!.size ||
            min_dist(template.object.ray, token.center) < token_radius * canvas.dimensions!.size)
        );
      }
      if (template.t === "rect") {
        if (template.object._getGridHighlightShape().contains(token.center.x, token.center.y)) return true;
        let s1 = Ray.fromAngle(template.object.ray.A.x, template.object.ray.A.y, 0, template.object.ray.dx);
        let s2 = new Ray(s1.B, template.object.ray.B);
        let s3 = Ray.fromAngle(s2.B.x, s2.B.y, Math.PI, template.object.ray.dx);
        let s4 = new Ray(s3.B, s1.A);
        return (
          min_dist(s1, token.center) < token_radius * canvas.dimensions!.size ||
          min_dist(s2, token.center) < token_radius * canvas.dimensions!.size ||
          min_dist(s3, token.center) < token_radius * canvas.dimensions!.size ||
          min_dist(s4, token.center) < token_radius * canvas.dimensions!.size
        );
      }

      return false;
    };
  } else {
    const { sizeX, sizeY } = canvas.grid!;
    const template_offsets = (<{ x: number; y: number }[]>template.object._getGridHighlightPositions()).map(
      ({ x, y }) => canvas.grid!.getOffset({ x: x + sizeX / 2, y: y + sizeY / 2 })
    );
    test_token = (token: LancerToken) => {
      const token_offsets = token.getOccupiedSpaces().map(p => canvas.grid!.getOffset(p));
      return token_offsets.some(o => template_offsets.some(e => o.i === e.i && o.j === e.j));
    };
  }

  // Get list of tokens and dispositions to ignore.
  let ignore = canvas.templates!.get(templateId)!.document.getFlag(game.system.id, "ignore");

  // Test if each token occupies a targeted space and target it if true
  const targets = canvas
    .tokens!.quadtree!.getObjects(template.object.bounds, {
      collisionTest: o => {
        const t = o.t as any as LancerToken;
        let skip = (ignore?.tokens.includes(t.id) || ignore?.dispositions.includes(t.document.disposition)) ?? false;
        return !skip && test_token(t);
      },
    })
    .toObject()
    .map(t => t.id);
  game.user!.updateTokenTargets(targets);
  game.user!.broadcastActivity({ targets });
}

/// Math Zone
// Reference: Calculus the Classic Edition Ch 14.3, Swokowski

function dot_product(p: Ray, q: Ray) {
  return p.dx * q.dx + p.dy * q.dy;
}

/**
 * Component of PQ along PR
 * $\textbf{comp}_{\overrightarrow{PR}} \overrightarrow{PQ}$
 */
function comp(PR: Ray, PQ: Ray) {
  return dot_product(PR, PQ) / PR.distance;
}

/**
 * Calculate the shortest distance from point p to the segment in pixels
 */
function min_dist(seg: Ray, p: Point) {
  const T = new Ray(seg.A, p);
  const component = comp(seg, T);
  if (component <= 0) return T.distance;
  if (component >= seg.distance) return new Ray(seg.B, p).distance;
  return Math.sqrt(T.distance ** 2 - component ** 2);
}

function in_cone_arc(ray: Ray, angle: number, p: Point) {
  // using unit vectors for brevity
  const a = Ray.fromAngle(ray.A.x, ray.A.y, ray.angle, 1);
  const b: Ray = Ray.towardsPoint(ray.A, p, 1);
  const theta = Math.acos(Math.clamp(-1, dot_product(a, b), 1));
  return theta < angle / 2;
}
