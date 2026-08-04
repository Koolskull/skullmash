# ☦ SKULLMASH

**K-OS III native sketch-to-3D balloon tool**

Cut out / draw closed shapes → inflate into soft 3D meshes → place control pins + record keyframes → export **binary glTF (.glb)** + **JSON animation / project data**.

Designed for the music + visuals production pipeline inside [K-OS-III](https://github.com/Koolskull/K-OS-III) (Datamoshpit, Stardrain, shotlists, etc.).

> **v0.1.1** — audited. Dead code removed, earcut triangulation (concave-safe), proper Three.js dispose, object-URL leaks fixed, status/hook correctness improved.

## Quick start

```bash
git clone https://github.com/Koolskull/skullmash.git
cd skullmash
npm install
npm run dev
```

## Workflow

1. **DRAW** — Click points to form a closed shape. Right-click, Enter, or CLOSE SHAPE when ≥3 points.
2. Optional: load a background image and trace cutouts over it.
3. **INFLATE** — Meshes rebuild automatically (earcut + radial height falloff).
4. **ANIMATE** — Click yellow pins. Move the timeline and hit REC KF.
5. **EXPORT**
   - `.glb` — binary glTF of the inflated meshes
   - `.json` — project + pin + keyframe data for Stardrain / custom players

## Integration with K-OS-III

Standalone Vite + React app that can later become a windowed app inside the K-OS desktop (`src/components/apps/skullmash/...`). Aesthetic already matches KOOLDRAW / DATAMOSHPIT / SHOTLIST.

## Audit notes (v0.1.1)

- Removed unused helpers and the discarded earcut path; now uses earcut properly.
- Shared material + full geometry/material dispose on rebuild and unmount.
- Background image object URLs are revoked.
- Right-click / left-click handling cleaned; status no longer uses stale closures.
- Keyboard Enter closes the current shape; dependency arrays corrected.

## Roadmap

- Better height field / multi-region depth order
- Pin-driven deformation driven by keyframes
- Embed mode for other K-OS apps
- Optional future WASM path closer to original Monster Mash algorithms

Inspired by [google/monster-mash](https://github.com/google/monster-mash) (still live at monstermash.zone). Apache-2.0 spirit.

☦
