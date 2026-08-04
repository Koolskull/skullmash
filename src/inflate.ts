import earcut from "earcut";
import * as THREE from "three";

export type Point2 = { x: number; y: number };

export function resampleClosed(pts: Point2[], target = 64): Point2[] {
  if (pts.length < 3) return pts.slice();
  const segs: { a: Point2; b: Point2; len: number }[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len });
    total += len;
  }
  if (total < 1e-6) return pts.slice();
  const out: Point2[] = [];
  const step = total / target;
  let si = 0;
  let along = 0;
  for (let i = 0; i < target; i++) {
    const want = i * step;
    while (si < segs.length - 1 && along + segs[si]!.len < want) {
      along += segs[si]!.len;
      si++;
    }
    const s = segs[si]!;
    const t = s.len < 1e-9 ? 0 : (want - along) / s.len;
    out.push({
      x: s.a.x + (s.b.x - s.a.x) * t,
      y: s.a.y + (s.b.y - s.a.y) * t,
    });
  }
  return out;
}

function pointInPoly(x: number, y: number, poly: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToEdge(x: number, y: number, poly: Point2[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 < 1e-12 ? 0 : ((x - a.x) * dx + (y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    if (d < min) min = d;
  }
  return min;
}

/** Mild saturation + contrast so photo textures read on cream paper. */
function punchColor(r: number, g: number, b: number, amount = 1.12): [number, number, number] {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = 1.18;
  return [
    Math.min(1, l + (r - l) * sat) * amount,
    Math.min(1, l + (g - l) * sat) * amount,
    Math.min(1, l + (b - l) * sat) * amount,
  ];
}

export type InflateOptions = {
  canvasW: number;
  canvasH: number;
  heightScale?: number;
  imageData?: ImageData | null;
  fillColor?: [number, number, number];
};

/**
 * Balloon-inflate a closed contour.
 * earcut densified ring only → midpoint subdivision → edge-distance height.
 * Vertex colors sample the source photo when available.
 */
export function inflatePolygon(
  rawPts: Point2[],
  opts: InflateOptions,
): THREE.BufferGeometry {
  const { canvasW, canvasH } = opts;
  const heightScale = opts.heightScale ?? 1.55;
  const fill = opts.fillColor ?? [0.78, 0.78, 0.8];

  if (rawPts.length < 3) return new THREE.BufferGeometry();

  const contour = resampleClosed(rawPts, Math.min(120, Math.max(48, rawPts.length)));
  const flat: number[] = [];
  for (const p of contour) flat.push(p.x, p.y);
  let indices = earcut(flat, undefined, 2);
  if (indices.length === 0) return new THREE.BufferGeometry();

  let verts: Point2[] = contour.map((p) => ({ ...p }));

  for (let pass = 0; pass < 2; pass++) {
    const edgeMid = new Map<string, number>();
    const newIndices: number[] = [];
    const midKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

    const getMid = (a: number, b: number) => {
      const k = midKey(a, b);
      let id = edgeMid.get(k);
      if (id !== undefined) return id;
      const pa = verts[a]!;
      const pb = verts[b]!;
      id = verts.length;
      verts.push({ x: (pa.x + pb.x) * 0.5, y: (pa.y + pb.y) * 0.5 });
      edgeMid.set(k, id);
      return id;
    };

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]!;
      const b = indices[i + 1]!;
      const c = indices[i + 2]!;
      const ab = getMid(a, b);
      const bc = getMid(b, c);
      const ca = getMid(c, a);
      newIndices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    indices = newIndices;
  }

  let maxIn = 1;
  for (const p of verts) {
    if (pointInPoly(p.x, p.y, contour) || distToEdge(p.x, p.y, contour) < 1) {
      maxIn = Math.max(maxIn, distToEdge(p.x, p.y, contour));
    }
  }
  let cx = 0;
  let cy = 0;
  for (const p of contour) {
    cx += p.x;
    cy += p.y;
  }
  cx /= contour.length;
  cy /= contour.length;
  maxIn = Math.max(maxIn, distToEdge(cx, cy, contour), 8);

  const img = opts.imageData;
  const sampleColor = (px: number, py: number): [number, number, number] => {
    if (!img) return fill;
    const ix = Math.max(0, Math.min(img.width - 1, Math.floor(px)));
    const iy = Math.max(0, Math.min(img.height - 1, Math.floor(py)));
    const i = (iy * img.width + ix) * 4;
    return punchColor(img.data[i]! / 255, img.data[i + 1]! / 255, img.data[i + 2]! / 255);
  };

  const heightAt = (x: number, y: number) => {
    const d = distToEdge(x, y, contour);
    const t = Math.max(0, Math.min(1, d / maxIn));
    const smooth = t * t * (3 - 2 * t);
    return heightScale * smooth * Math.max(0.6, maxIn * 0.02);
  };

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  for (const p of verts) {
    const h = heightAt(p.x, p.y);
    positions.push((p.x - canvasW / 2) * 0.01, h, (p.y - canvasH / 2) * 0.01);
    uvs.push(p.x / canvasW, 1 - p.y / canvasH);
    const [r, g, b] = sampleColor(p.x, p.y);
    const lift = img ? 1.05 : 0.9 + 0.2 * Math.min(1, h);
    colors.push(Math.min(1, r * lift), Math.min(1, g * lift), Math.min(1, b * lift));
  }

  const nVerts = verts.length;
  for (const p of verts) {
    const h = heightAt(p.x, p.y);
    positions.push((p.x - canvasW / 2) * 0.01, -h * 0.68, (p.y - canvasH / 2) * 0.01);
    uvs.push(p.x / canvasW, 1 - p.y / canvasH);
    const [r, g, b] = sampleColor(p.x, p.y);
    const lift = img ? 0.68 : 0.5;
    colors.push(r * lift, g * lift, b * lift);
  }

  const fullIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    fullIndices.push(indices[i]!, indices[i + 1]!, indices[i + 2]!);
    fullIndices.push(
      indices[i]! + nVerts,
      indices[i + 2]! + nVerts,
      indices[i + 1]! + nVerts,
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(fullIndices);
  geo.computeVertexNormals();
  return geo;
}
