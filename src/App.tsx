/*
 *                    ☦
 *            ╔══════════════════╗
 *            ║  SKULLMASH       ║
 *            ║  CUTOUT → 3D     ║
 *            ╚══════════════════╝
 *   K-OS III native production tool
 *   Draw / import cutouts → balloon inflate →
 *   keyframe pins → export .glb + JSON anim data
 *   Designed for Datamoshpit / Stardrain / visuals pipeline
 *
 *   v0.1.1 — audited: removed dead code, fixed memory leaks,
 *   proper earcut triangulation, cleaner dispose, status fixes.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import earcut from "earcut";

type Mode = "DRAW" | "INFLATE" | "ANIMATE" | "EXPORT";

interface Point2 {
  x: number;
  y: number;
}

interface Shape {
  id: string;
  points: Point2[];
  color: string;
}

interface Pin {
  id: string;
  x: number;
  y: number;
}

interface Keyframe {
  time: number;
  pins: { id: string; x: number; y: number }[];
}

const CANVAS_W = 512;
const CANVAS_H = 512;

/** Inflate a closed polygon into a soft 3D mesh using earcut + radial height. */
function inflateShape(shape: Shape): THREE.BufferGeometry {
  const pts = shape.points;
  if (pts.length < 3) return new THREE.BufferGeometry();

  // Flatten for earcut (handles concave polygons correctly)
  const flat: number[] = [];
  for (const p of pts) flat.push(p.x, p.y);
  const indices = earcut(flat);
  if (indices.length === 0) return new THREE.BufferGeometry();

  // Centroid for height falloff
  let cx = 0, cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;

  let maxDist = 0;
  for (const p of pts) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > maxDist) maxDist = d;
  }
  if (maxDist < 1e-6) maxDist = 1;

  const heightScale = 0.32;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  for (const p of pts) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    // Higher in the middle, near-zero at boundary → soft balloon feel
    const h = heightScale * Math.max(0, 1 - d / maxDist) * maxDist * 0.85;
    positions.push(
      (p.x - CANVAS_W / 2) / 100,
      h,
      (p.y - CANVAS_H / 2) / 100
    );
    uvs.push(p.x / CANVAS_W, 1 - p.y / CANVAS_H);
    colors.push(0.18, 0.92, 0.52);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function disposeObject3D(obj: THREE.Object3D) {
  if ((obj as THREE.Mesh).isMesh) {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>("DRAW");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point2[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [time, setTime] = useState(0);
  const [status, setStatus] = useState(
    "DRAW: click points to form a shape. Right-click or CLOSE SHAPE when ≥3 pts."
  );
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const bgUrlRef = useRef<string | null>(null);

  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const animIdRef = useRef(0);
  const sharedMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // --- 2D redraw ---
  const redraw2d = useCallback(() => {
    const c = canvas2dRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (bgImage) {
      ctx.globalAlpha = 0.42;
      ctx.drawImage(bgImage, 0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }

    for (const s of shapes) {
      if (s.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = s.color + "44";
      ctx.fill();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (currentPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      }
      ctx.strokeStyle = "#00ff9d";
      ctx.lineWidth = 2;
      ctx.stroke();
      for (const p of currentPoints) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#00ff9d";
        ctx.fill();
      }
    }

    for (const pin of pins) {
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffcc00";
      ctx.fill();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [shapes, currentPoints, pins, bgImage]);

  useEffect(() => {
    redraw2d();
  }, [redraw2d]);

  // --- Three.js one-time setup ---
  useEffect(() => {
    const container = threeContainerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80);
    camera.position.set(0, 3.2, 5.8);
    camera.lookAt(0, 0.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(512, 512);
    container.replaceChildren(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1.15);
    light.position.set(2.5, 7, 4);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040, 0.55));

    const group = new THREE.Group();
    scene.add(group);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.42,
      metalness: 0.08,
    });
    sharedMatRef.current = mat;

    rendererRef.current = renderer;
    meshGroupRef.current = group;

    let running = true;
    const animate = () => {
      if (!running) return;
      animIdRef.current = requestAnimationFrame(animate);
      group.rotation.y += 0.0035;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      running = false;
      cancelAnimationFrame(animIdRef.current);
      // Dispose everything we own
      while (group.children.length) {
        const child = group.children[0];
        group.remove(child);
        disposeObject3D(child);
      }
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // Rebuild meshes when shapes change
  useEffect(() => {
    const group = meshGroupRef.current;
    const mat = sharedMatRef.current;
    if (!group || !mat) return;

    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      disposeObject3D(child);
    }

    for (const s of shapes) {
      const geo = inflateShape(s);
      if (geo.getAttribute("position")?.count) {
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
      }
    }
  }, [shapes]);

  const closeCurrentShape = useCallback(() => {
    setCurrentPoints((pts) => {
      if (pts.length < 3) return pts;
      const newShape: Shape = {
        id: "s" + Date.now().toString(36),
        points: [...pts],
        color: "#00ff9d",
      };
      setShapes((prev) => {
        const next = [...prev, newShape];
        setStatus(`Shape closed (${newShape.points.length} pts). Total: ${next.length}`);
        return next;
      });
      return [];
    });
  }, []);

  // Keyboard: Enter closes current shape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && mode === "DRAW" && currentPoints.length >= 3) {
        e.preventDefault();
        closeCurrentShape();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, currentPoints.length, closeCurrentShape]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // left-click only
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H;

    if (mode === "DRAW") {
      setCurrentPoints((prev) => [...prev, { x, y }]);
    } else if (mode === "ANIMATE") {
      const pin: Pin = { id: "p" + Date.now().toString(36), x, y };
      setPins((prev) => {
        const next = [...prev, pin];
        setStatus(`Pin added · ${next.length} total`);
        return next;
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (mode === "DRAW") closeCurrentShape();
  };

  const clearAll = () => {
    setShapes([]);
    setCurrentPoints([]);
    setPins([]);
    setKeyframes([]);
    setStatus("Cleared.");
  };

  const onImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // revoke previous
    if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
    const url = URL.createObjectURL(file);
    bgUrlRef.current = url;
    const img = new Image();
    img.onload = () => {
      setBgImage(img);
      setStatus("Background loaded — trace cutouts over it.");
    };
    img.src = url;
  };

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
    };
  }, []);

  const exportGLB = () => {
    const group = meshGroupRef.current;
    if (!group || group.children.length === 0) {
      setStatus("Nothing to export. Draw shapes first.");
      return;
    }
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], {
          type: "model/gltf-binary",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `skullmash_${Date.now()}.glb`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus("Exported binary glTF (.glb)");
      },
      (err) => {
        console.error(err);
        setStatus("GLB export failed");
      },
      { binary: true }
    );
  };

  const exportJSON = () => {
    const data = {
      version: "0.1.1",
      tool: "SKULLMASH / K-OS III",
      canvas: { w: CANVAS_W, h: CANVAS_H },
      shapes: shapes.map((s) => ({ id: s.id, points: s.points })),
      pins,
      keyframes,
      notes:
        "Pair with the .glb for keyframe-driven deformation or pin playback in Stardrain / custom players.",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skullmash_anim_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported JSON project + animation data");
  };

  const recordKeyframe = () => {
    if (pins.length === 0) return;
    const kf: Keyframe = {
      time,
      pins: pins.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    };
    setKeyframes((prev) =>
      [...prev.filter((k) => Math.abs(k.time - time) > 0.015), kf].sort(
        (a, b) => a.time - b.time
      )
    );
    setStatus(`Keyframe @ t=${time.toFixed(2)}`);
  };

  return (
    <div className="kos-window">
      <div className="kos-titlebar">
        <span className="glyph">☦</span>
        <span className="title">SKULLMASH</span>
        <span className="subtitle">
          CUTOUT → BALLOON → KEYFRAME → GLB / JSON · K-OS III
        </span>
      </div>

      <div className="ascii-header">
{`╔══════════════════════════════════════════════════════════════╗
║  DRAW closed shapes  ·  INFLATE to soft 3D  ·  pin + keyframe ║
║  Export binary glTF + JSON for Datamoshpit / Stardrain pipeline ║
╚══════════════════════════════════════════════════════════════╝`}
      </div>

      <div className="kos-toolbar">
        <button
          className={mode === "DRAW" ? "active" : ""}
          onClick={() => {
            setMode("DRAW");
            setStatus("DRAW: click points. Right-click / Enter / CLOSE when ≥3.");
          }}
        >
          DRAW
        </button>
        <button
          className={mode === "INFLATE" ? "active" : ""}
          onClick={() => {
            setMode("INFLATE");
            setStatus("INFLATE: meshes live. Switch to ANIMATE for pins.");
          }}
        >
          INFLATE
        </button>
        <button
          className={mode === "ANIMATE" ? "active" : ""}
          onClick={() => {
            setMode("ANIMATE");
            setStatus("ANIMATE: click yellow pins. REC KF on the timeline.");
          }}
        >
          ANIMATE
        </button>
        <button
          className={mode === "EXPORT" ? "active" : ""}
          onClick={() => setMode("EXPORT")}
        >
          EXPORT
        </button>
        <div className="sep" />
        <button
          onClick={closeCurrentShape}
          disabled={currentPoints.length < 3}
        >
          CLOSE SHAPE
        </button>
        <button onClick={clearAll}>CLEAR</button>
        <div className="sep" />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            BG IMAGE
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={onImageUpload}
            style={{ fontSize: 11 }}
          />
        </label>
      </div>

      <div className="kos-main">
        <div className="kos-panel" style={{ width: 512, flexShrink: 0 }}>
          <div className="kos-panel-header">2D CUTOUT / DRAW</div>
          <canvas
            ref={canvas2dRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
            style={{ width: 512, height: 512 }}
          />
        </div>

        <div className="kos-panel" style={{ flex: 1, minWidth: 0 }}>
          <div className="kos-panel-header">3D BALLOON VIEW (auto-rotate)</div>
          <div
            ref={threeContainerRef}
            style={{
              width: "100%",
              height: 512,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              background: "#050505",
            }}
          />
        </div>
      </div>

      <div className="timeline">
        <button onClick={recordKeyframe} disabled={pins.length === 0}>
          REC KF
        </button>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            minWidth: 40,
          }}
        >
          t={time.toFixed(2)}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={time}
          onChange={(e) => setTime(parseFloat(e.target.value))}
        />
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {keyframes.length} kfs
        </span>
        <div className="sep" />
        <button onClick={exportGLB}>EXPORT .GLB</button>
        <button onClick={exportJSON}>EXPORT JSON</button>
      </div>

      <div className="kos-status">
        <span>{status}</span>
        <span>
          shapes: {shapes.length} · pins: {pins.length} · mode: {mode}
        </span>
      </div>
    </div>
  );
}
