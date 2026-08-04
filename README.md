# ☦ SKULLMASH

**K-OS III native sketch-to-3D balloon tool**

Cut out / draw closed shapes → inflate into soft 3D meshes → place control pins + record keyframes → export **binary glTF (.glb)** + **JSON animation / project data**.

Designed for the music + visuals production pipeline inside [K-OS-III](https://github.com/Koolskull/K-OS-III) (Datamoshpit, Stardrain, shotlists, etc.).

> Early v0.1 — functional prototype. The inflation is a simplified radial/centroid balloon (not the full ARAP-L from the original Monster Mash paper). Good enough for organic/cartoony production assets and further iteration.

## Quick start

```bash
git clone https://github.com/Koolskull/skullmash.git
cd skullmash
npm install
npm run dev
```

Open the local URL. Dark K-OS chrome, monospace, green accent.

## Workflow

1. **DRAW** — Click to place points of a closed shape. Right-click (or CLOSE SHAPE) when ≥3 points.
2. Optional: load a background image and trace cutouts over it.
3. **INFLATE** — Meshes are generated automatically (centroid-lifted fan for volume).
4. **ANIMATE** — Click yellow pins onto the 2D view. Move the timeline slider and hit REC KF to store keyframes.
5. **EXPORT**
   - `.glb` — binary glTF of the current inflated meshes (Three.js GLTFExporter).
   - `.json` — project + pin + keyframe data ready for custom players or Stardrain / K-OS visual systems.

## Integration with K-OS-III

This repo is intentionally a clean, standalone Vite + React app so it can be:

- Used independently, or
- Ported as a new windowed app (`src/components/apps/skullmash/SkullMashApp.tsx`) inside the K-OS desktop shell.

The visual language (titlebar, toolbar, status bar, ☦, ALL-CAPS buttons, dark panels) already matches existing K-OS apps (KOOLDRAW, DATAMOSHPIT, SHOTLIST…).

## Roadmap (production context)

- [ ] Proper constrained triangulation + better height field (distance-to-boundary or medial axis)
- [ ] Pin-based ARAP-style or Laplacian deformation driven by keyframes
- [ ] Multi-region depth ordering (like original Monster Mash layers)
- [ ] Direct JSON track format that Datamoshpit / Stardrain can scrub
- [ ] Embed mode for use inside other K-OS apps
- [ ] Optional WASM port of core Monster Mash algorithms later

## Origin

Inspired by the open-source [google/monster-mash](https://github.com/google/monster-mash) (SIGGRAPH Asia 2020) which is still live at https://monstermash.zone.  
SKULLMASH is a new, K-OS-native tool focused on the exact exports and aesthetic needed for ongoing production work.

## License

Apache-2.0 (same spirit as the original Monster Mash release).  
Code written for Koolskull / K-OS-III pipeline.

☦
