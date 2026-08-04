/*
 * SKULLMASH — Monster Mash–style image-first cutout → balloon → animate
 * Design language mirrors monstermash.zone paper stage + green Next,
 * with a thin K-OS chrome strip for identity inside K-OS-III.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ImagePlus,
  Pencil,
  MousePointer2,
  Trash2,
  Download,
  Upload,
  Eraser,
  RotateCcw,
  FileJson,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
} from "lucide-react";
import { inflatePolygon, type Point2 } from "./inflate";

type Mode = "DRAW" | "INFLATE" | "ANIMATE";

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

const CANVAS_W = 720;
const CANVAS_H = 720;
const STROKE_MIN_DIST = 2.2;
const SHAPE_COLORS = ["#c62828", "#1565c0", "#2e7d32", "#ef6c00", "#6a1b9a", "#00838f"];

function uid(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 9);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export default function SkullMashApp() {
  const [mode, setMode] = useState<Mode>("DRAW");
  const modeRef = useRef<Mode>("DRAW");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const shapesRef = useRef<Shape[]>([]);
  const strokeRef = useRef<Point2[]>([]);
  const [strokeVersion, setStrokeVersion] = useState(0);
  const drawingRef = useRef(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("Draw or upload an image to begin.");
  const [hasImage, setHasImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [ready, setReady] = useState(false);
  const [brush, setBrush] = useState(3);
  const [drawTool, setDrawTool] = useState<"pen" | "select">("pen");
  const [meshTick, setMeshTick] = useState(0);

  const bgUrlRef = useRef<string | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragPinRef = useRef<string | null>(null);

  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const threeHostRef = useRef<HTMLDivElement>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneReadyRef = useRef(false);
  const animIdRef = useRef(0);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const userOrbitRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  const bakeImage = useCallback((img: HTMLImageElement) => {
    const off = document.createElement("canvas");
    off.width = CANVAS_W;
    off.height = CANVAS_H;
    const octx = off.getContext("2d")!;
    const scale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    octx.fillStyle = "#f2eee6";
    octx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    octx.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
    imageDataRef.current = octx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  const applyImageElement = useCallback(
    (img: HTMLImageElement) => {
      try {
        bakeImage(img);
      } catch (e) {
        console.error(e);
        setStatus("Could not read image pixels — try another file.");
        return;
      }
      setHasImage(true);
      setReady(true);
      setMode("DRAW");
      setDrawTool("pen");
      setStatus("Trace closed shapes over the photo. Release to close a stroke.");
      setStrokeVersion((v) => v + 1);
    },
    [bakeImage],
  );

  const loadImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        setStatus("That file is not an image.");
        return;
      }
      if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
      const url = URL.createObjectURL(file);
      bgUrlRef.current = url;
      const img = new Image();
      img.onload = () => applyImageElement(img);
      img.onerror = () => setStatus("Failed to load image.");
      img.src = url;
    },
    [applyImageElement],
  );

  const loadSampleImage = useCallback(() => {
    const img = new Image();
    img.onload = () => applyImageElement(img);
    img.onerror = () => setStatus("Sample image missing — open your own file.");
    img.src = `${import.meta.env.BASE_URL}sample-creature.png`;
  }, [applyImageElement]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImageFile(f);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) loadImageFile(f);
  };

  const startBlank = () => {
    imageDataRef.current = null;
    if (bgUrlRef.current) {
      URL.revokeObjectURL(bgUrlRef.current);
      bgUrlRef.current = null;
    }
    setHasImage(false);
    setReady(true);
    setMode("DRAW");
    setDrawTool("pen");
    setStatus("Blank paper. Freehand-draw closed shapes, then Next.");
    setStrokeVersion((v) => v + 1);
  };

  useEffect(() => {
    return () => {
      if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
    };
  }, []);

  const redraw2d = useCallback(() => {
    const c = canvas2dRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const currentStroke = strokeRef.current;
    const lw = Math.max(1.5, brush * 0.9);

    ctx.fillStyle = "#f2eee6";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (imageDataRef.current) {
      ctx.putImageData(imageDataRef.current, 0, 0);
    } else {
      ctx.strokeStyle = "rgba(0,0,0,0.035)";
      ctx.lineWidth = 1;
      for (let i = 0; i < CANVAS_W; i += 48) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, CANVAS_H);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(CANVAS_W, i);
        ctx.stroke();
      }
    }

    for (const s of shapes) {
      if (s.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s.points[0]!.x, s.points[0]!.y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i]!.x, s.points[i]!.y);
      }
      ctx.closePath();
      ctx.fillStyle = s.color + "33";
      ctx.fill();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }

    if (currentStroke.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentStroke[0]!.x, currentStroke[0]!.y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i]!.x, currentStroke[i]!.y);
      }
      ctx.strokeStyle = "#c62828";
      ctx.lineWidth = lw;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      if (currentStroke.length > 2) {
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(
          currentStroke[currentStroke.length - 1]!.x,
          currentStroke[currentStroke.length - 1]!.y,
        );
        ctx.lineTo(currentStroke[0]!.x, currentStroke[0]!.y);
        ctx.strokeStyle = "rgba(198,40,40,0.4)";
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (mode === "ANIMATE") {
      for (const pin of pins) {
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#ea4335";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  }, [shapes, pins, strokeVersion, brush, mode]);

  useEffect(() => {
    if (mode === "DRAW" || mode === "ANIMATE") redraw2d();
  }, [redraw2d, mode, ready, hasImage]);

  useEffect(() => {
    if (!ready) return;
    const host = threeHostRef.current;
    if (!host) return;

    // MM inflate stage is a slightly cooler paper so balloons read clearly
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xece8e0);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);
    camera.position.set(0, 3.2, 5.6);
    camera.lookAt(0, 0.45, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const fit = () => {
      const s = Math.max(64, Math.min(host.clientWidth || 640, host.clientHeight || 640, 960));
      renderer.setSize(s, s, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };
    fit();
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    host.replaceChildren(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xfff8f0, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(3.5, 9, 4.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb0c4ff, 0.45);
    fill.position.set(-5, 2.5, -2);
    scene.add(fill);
    const hemi = new THREE.HemisphereLight(0xfff5e8, 0x8a8478, 0.35);
    scene.add(hemi);

    const group = new THREE.Group();
    scene.add(group);
    meshGroupRef.current = group;

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.38,
      metalness: 0.05,
    });
    matRef.current = mat;
    sceneReadyRef.current = true;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 0.4, 0);
    controls.enablePan = false;
    controls.minDistance = 1.8;
    controls.maxDistance = 16;
    controlsRef.current = controls;
    controls.addEventListener("start", () => {
      userOrbitRef.current = true;
    });
    controls.addEventListener("end", () => {
      setTimeout(() => {
        userOrbitRef.current = false;
      }, 2200);
    });

    let running = true;
    const tick = () => {
      if (!running) return;
      animIdRef.current = requestAnimationFrame(tick);
      controls.update();
      if (modeRef.current === "INFLATE" && !userOrbitRef.current) {
        group.rotation.y += 0.007;
      }
      renderer.render(scene, camera);
    };
    tick();

    const ro = new ResizeObserver(fit);
    ro.observe(host);
    setMeshTick((t) => t + 1);

    return () => {
      running = false;
      cancelAnimationFrame(animIdRef.current);
      ro.disconnect();
      controls.dispose();
      while (group.children.length) {
        const ch = group.children[0]!;
        group.remove(ch);
        (ch as THREE.Mesh).geometry?.dispose();
      }
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      meshGroupRef.current = null;
      matRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      sceneReadyRef.current = false;
    };
  }, [ready]);

  const rebuildMeshes = useCallback(() => {
    const group = meshGroupRef.current;
    const mat = matRef.current;
    if (!group || !mat || !sceneReadyRef.current) return 0;

    while (group.children.length) {
      const ch = group.children[0]!;
      group.remove(ch);
      (ch as THREE.Mesh).geometry?.dispose();
    }

    const list = shapesRef.current;
    let count = 0;
    for (const s of list) {
      const geo = inflatePolygon(s.points, {
        canvasW: CANVAS_W,
        canvasH: CANVAS_H,
        imageData: imageDataRef.current,
        heightScale: 1.7,
        fillColor: hexToRgb(s.color),
      });
      if (geo.getAttribute("position")?.count) {
        group.add(new THREE.Mesh(geo, mat));
        count++;
      }
    }

    if (count > 0 && cameraRef.current && controlsRef.current) {
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.5);
      const dist = maxDim * 2.15;
      cameraRef.current.position.set(
        center.x + dist * 0.42,
        center.y + dist * 0.48,
        center.z + dist * 0.95,
      );
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
      group.rotation.y = 0.4;
    }
    return count;
  }, []);

  useEffect(() => {
    rebuildMeshes();
  }, [rebuildMeshes, shapes, mode, ready, meshTick]);

  useEffect(() => {
    if (!playing || keyframes.length < 2) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const elapsed = ((now - t0) / 1000) % 1;
      setTime(elapsed);
      const sorted = [...keyframes].sort((a, b) => a.time - b.time);
      let a = sorted[0]!;
      let b = sorted[sorted.length - 1]!;
      for (let i = 0; i < sorted.length - 1; i++) {
        if (elapsed >= sorted[i]!.time && elapsed <= sorted[i + 1]!.time) {
          a = sorted[i]!;
          b = sorted[i + 1]!;
          break;
        }
      }
      const span = Math.max(1e-6, b.time - a.time);
      const u = Math.max(0, Math.min(1, (elapsed - a.time) / span));
      setPins((prev) =>
        prev.map((p) => {
          const pa = a.pins.find((x) => x.id === p.id);
          const pb = b.pins.find((x) => x.id === p.id);
          if (!pa || !pb) return p;
          return {
            ...p,
            x: pa.x + (pb.x - pa.x) * u,
            y: pa.y + (pb.y - pa.y) * u,
          };
        }),
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, keyframes]);

  const ptr = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const commitStroke = useCallback((pts: Point2[]) => {
    if (pts.length < 8) {
      setStatus("Stroke too short — draw a fuller closed region.");
      strokeRef.current = [];
      setStrokeVersion((v) => v + 1);
      return;
    }
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    let closed = pts;
    if (Math.hypot(first.x - last.x, first.y - last.y) > 24) {
      closed = [...pts, first];
    }
    setShapes((prev) => {
      const color = SHAPE_COLORS[prev.length % SHAPE_COLORS.length]!;
      const shape: Shape = { id: uid("s"), points: closed, color };
      const next = [...prev, shape];
      setStatus(`Region ${next.length} closed. Draw more, or press Next to inflate.`);
      return next;
    });
    strokeRef.current = [];
    setStrokeVersion((v) => v + 1);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (!ready) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = ptr(e);
    if (mode === "DRAW" && drawTool === "pen") {
      drawingRef.current = true;
      strokeRef.current = [p];
      setStrokeVersion((v) => v + 1);
    } else if (mode === "ANIMATE") {
      const hit = pins.find((pin) => Math.hypot(pin.x - p.x, pin.y - p.y) < 16);
      if (hit) dragPinRef.current = hit.id;
      else {
        const pin: Pin = { id: uid("p"), x: p.x, y: p.y };
        setPins((prev) => {
          setStatus(`Pin ${prev.length + 1} · drag to move · REC KF on the timeline`);
          return [...prev, pin];
        });
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = ptr(e);
    if (mode === "DRAW" && drawingRef.current) {
      const prev = strokeRef.current;
      const last = prev[prev.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= STROKE_MIN_DIST) {
        strokeRef.current = [...prev, p];
        setStrokeVersion((v) => v + 1);
      }
    } else if (mode === "ANIMATE" && dragPinRef.current) {
      const id = dragPinRef.current;
      setPins((prev) => prev.map((pin) => (pin.id === id ? { ...pin, x: p.x, y: p.y } : pin)));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    dragPinRef.current = null;
    if (mode === "DRAW" && drawingRef.current) {
      drawingRef.current = false;
      commitStroke(strokeRef.current);
    }
  };

  const clearAll = () => {
    setShapes([]);
    strokeRef.current = [];
    setPins([]);
    setKeyframes([]);
    setStrokeVersion((v) => v + 1);
    setStatus("Cleared. Draw new regions or upload another image.");
  };

  const undoLast = () => {
    setShapes((prev) => prev.slice(0, -1));
    setStatus("Removed last region.");
  };

  const goNext = () => {
    if (mode === "DRAW") {
      if (shapes.length === 0) {
        setStatus("Draw at least one closed region first.");
        return;
      }
      setMode("INFLATE");
      setStatus("Inflated balloon — drag to orbit, scroll to zoom. Next → Animate.");
      requestAnimationFrame(() => {
        const n = rebuildMeshes();
        setStatus(
          n > 0
            ? `Inflated ${n} balloon${n === 1 ? "" : "s"} — drag to orbit.`
            : "Inflate produced no mesh — try a fuller closed stroke.",
        );
      });
    } else if (mode === "INFLATE") {
      setMode("ANIMATE");
      setStatus("Place red pins on the sketch, drag them, record keyframes.");
    }
  };

  const goBack = () => {
    if (mode === "ANIMATE") {
      setMode("INFLATE");
      setStatus("Back to inflate — orbit the balloon.");
      requestAnimationFrame(() => rebuildMeshes());
    } else if (mode === "INFLATE") {
      setMode("DRAW");
      setStatus("Back to draw — add or edit freehand regions.");
      setStrokeVersion((v) => v + 1);
    }
  };

  const recordKeyframe = () => {
    if (pins.length === 0) {
      setStatus("Place control pins first.");
      return;
    }
    const kf: Keyframe = {
      time,
      pins: pins.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    };
    setKeyframes((prev) =>
      [...prev.filter((k) => Math.abs(k.time - time) > 0.02), kf].sort((a, b) => a.time - b.time),
    );
    setStatus(`Keyframe @ t=${time.toFixed(2)}`);
  };

  const exportGLB = () => {
    rebuildMeshes();
    const g = meshGroupRef.current;
    if (!g || g.children.length === 0) {
      setStatus("Nothing to export — draw & inflate first.");
      return;
    }
    const exporter = new GLTFExporter();
    exporter.parse(
      g,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
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
      { binary: true },
    );
  };

  const exportJSON = () => {
    const data = {
      version: "0.3.0",
      tool: "SKULLMASH",
      workflow: "image → freehand cutout → balloon inflate → pin keyframes",
      canvas: { w: CANVAS_W, h: CANVAS_H },
      shapes: shapes.map((s) => ({ id: s.id, points: s.points, color: s.color })),
      pins,
      keyframes,
      notes:
        "Monster Mash–style image-first pipeline. Pair .glb with this JSON for pin playback. Optional NFT mint planned (user-initiated, for a fee).",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skullmash_anim_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported JSON project + animation data");
  };

  const showSketch = mode === "DRAW" || mode === "ANIMATE";
  const show3d = mode === "INFLATE";
  const onWelcome = !ready;

  const nextLabel = mode === "ANIMATE" ? "Export" : "Next";
  const nextAction = () => {
    if (mode === "ANIMATE") {
      exportGLB();
      return;
    }
    goNext();
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <header className="mm-kos-bar flex shrink-0 items-center gap-3 px-3 py-2">
        <span className="mm-kos-title">SKULLMASH</span>
        <span className="mm-kos-chip hidden sm:inline">K-OS · cutout → balloon</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="mm-footer-btn primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-3.5 w-3.5" /> Image
          </button>
          <button
            type="button"
            className="mm-footer-btn"
            style={{
              background: "transparent",
              borderColor: "var(--color-border)",
              color: "var(--color-muted)",
            }}
            onClick={() => {
              setReady(false);
              setShapes([]);
              setPins([]);
              setKeyframes([]);
              strokeRef.current = [];
              setMode("DRAW");
              setStatus("Draw or upload an image to begin.");
            }}
          >
            New
          </button>
        </div>
      </header>

      <div
        className={`mm-stage mm-stage-shadow relative min-h-0 flex-1 ${dragOver ? "mm-drop-flash" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {ready && (
          <div className="pointer-events-auto absolute left-1/2 top-3 z-20 -translate-x-1/2">
            <div className="mm-steps">
              <button
                type="button"
                className={`mm-step ${mode === "DRAW" ? "active" : shapes.length ? "done" : ""}`}
                onClick={() => {
                  setMode("DRAW");
                  setStatus("Freehand closed regions over the image.");
                  setStrokeVersion((v) => v + 1);
                }}
              >
                <span className="num">1</span> Draw
              </button>
              <button
                type="button"
                className={`mm-step ${mode === "INFLATE" ? "active" : ""}`}
                onClick={() => {
                  if (shapes.length === 0) {
                    setStatus("Draw a region first.");
                    return;
                  }
                  setMode("INFLATE");
                  setStatus("Soft balloon mesh — orbit with drag.");
                  requestAnimationFrame(() => rebuildMeshes());
                }}
              >
                <span className="num">2</span> Inflate
              </button>
              <button
                type="button"
                className={`mm-step ${mode === "ANIMATE" ? "active" : ""}`}
                onClick={() => {
                  if (shapes.length === 0) {
                    setStatus("Draw & inflate first.");
                    return;
                  }
                  setMode("ANIMATE");
                  setStatus("Place pins, record keyframes.");
                }}
              >
                <span className="num">3</span> Animate
              </button>
            </div>
          </div>
        )}

        {ready && mode === "DRAW" && (
          <div className="absolute left-3 top-1/2 z-20 -translate-y-1/2 sm:left-4">
            <div className="mm-rail">
              <button
                type="button"
                className={`mm-rail-btn ${drawTool === "pen" ? "active" : ""}`}
                title="Freehand pen"
                onClick={() => setDrawTool("pen")}
              >
                <Pencil className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className={`mm-rail-btn ${drawTool === "select" ? "active" : ""}`}
                title="Select (view only)"
                onClick={() => setDrawTool("select")}
              >
                <MousePointer2 className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <div className="my-1 h-px w-7 bg-black/10" />
              <button
                type="button"
                className="mm-rail-btn"
                title="Open image"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="mm-rail-btn"
                title="Undo last region"
                disabled={shapes.length === 0}
                onClick={undoLast}
              >
                <RotateCcw className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="mm-rail-btn danger"
                title="Clear all"
                disabled={shapes.length === 0}
                onClick={clearAll}
              >
                <Eraser className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
          <div className="relative aspect-square h-full max-h-full w-full max-w-[min(100%,100dvh-8rem)]">
            <canvas
              data-testid="sketch-canvas"
              ref={canvas2dRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className={`absolute inset-0 h-full w-full touch-none ${showSketch ? "z-10" : "pointer-events-none z-0 opacity-0"}`}
              style={{
                cursor:
                  mode === "DRAW" && drawTool === "pen"
                    ? "crosshair"
                    : mode === "ANIMATE"
                      ? "pointer"
                      : "default",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={(e) => e.preventDefault()}
            />

            <div
              ref={threeHostRef}
              data-testid="three-host"
              className={`absolute inset-0 ${show3d ? "z-10" : "pointer-events-none z-0 opacity-0"}`}
            />

            {onWelcome && (
              <div className="mm-enter absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 px-6">
                <div className="mm-welcome-copy">
                  <div className="mb-5 flex justify-center text-[#9aa0a6]">
                    <Pencil className="h-14 w-14" strokeWidth={1.15} />
                  </div>
                  <h1>Draw or upload an image</h1>
                  <p>Freehand cutouts inflate into soft 3D — just like Monster Mash.</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    className="mm-next"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Upload image
                  </button>
                  <button type="button" className="mm-back" onClick={loadSampleImage}>
                    Sample creature
                  </button>
                  <button type="button" className="mm-back" onClick={startBlank}>
                    Blank paper
                  </button>
                </div>
                <p className="max-w-sm text-center text-xs leading-relaxed text-[#9aa0a6]">
                  Drop a photo anywhere on this paper. Trace closed shapes, hit{" "}
                  <span className="font-semibold text-[#34a853]">Next</span>, then animate pins.
                </p>
              </div>
            )}

            {show3d && shapes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                <p className="rounded-full bg-black/40 px-4 py-2 text-sm text-white">
                  Draw regions first
                </p>
              </div>
            )}
          </div>
        </div>

        {ready && mode === "DRAW" && (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 max-sm:bottom-16">
            <label className="mm-brush">
              Brush
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={brush}
                onChange={(e) => setBrush(parseFloat(e.target.value))}
              />
            </label>
          </div>
        )}

        {ready && mode === "ANIMATE" && (
          <div className="absolute bottom-4 left-1/2 z-20 flex w-[min(92%,480px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-2 shadow-md backdrop-blur-md max-sm:bottom-16">
            <button type="button" className="mm-footer-btn" onClick={recordKeyframe}>
              REC KF
            </button>
            <button
              type="button"
              className="mm-footer-btn"
              disabled={keyframes.length < 2}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <span className="font-mono text-[11px] tabular-nums text-[#5f6368]">
              t={time.toFixed(2)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={time}
              onChange={(e) => {
                setPlaying(false);
                setTime(parseFloat(e.target.value));
              }}
              className="min-w-[80px] flex-1 accent-[#34a853]"
            />
            <span className="text-[11px] text-[#80868b]">
              {pins.length}p · {keyframes.length}kf
            </span>
            <button
              type="button"
              className="mm-footer-btn"
              disabled={pins.length === 0}
              onClick={() => {
                setPins([]);
                setKeyframes([]);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {ready && (
          <div className="absolute bottom-4 right-3 z-30 flex items-center gap-2 sm:right-5">
            {mode !== "DRAW" && (
              <button type="button" className="mm-back" onClick={goBack}>
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            )}
            <button
              type="button"
              className="mm-next"
              onClick={nextAction}
              disabled={mode === "DRAW" && shapes.length === 0}
              data-testid="next-btn"
            >
              {nextLabel}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <footer className="mm-footer shrink-0">
        <span className="mm-status min-w-0 flex-1 truncate">{status}</span>
        <span className="mm-status hidden sm:inline">
          {shapes.length} region{shapes.length === 1 ? "" : "s"}
          {hasImage ? " · image" : ready ? " · blank" : ""}
        </span>
        <button type="button" className="mm-footer-btn primary" onClick={exportGLB}>
          <Download className="h-3.5 w-3.5" /> .GLB
        </button>
        <button type="button" className="mm-footer-btn primary" onClick={exportJSON}>
          <FileJson className="h-3.5 w-3.5" /> JSON
        </button>
        <button
          type="button"
          className="mm-footer-btn"
          disabled
          title="Optional mint of your object as an NFT for a fee — coming later"
        >
          <Sparkles className="h-3.5 w-3.5" /> Mint NFT
        </button>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
