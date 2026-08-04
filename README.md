# ◎ SKULLMASH

**Image-first freehand cutouts → soft 3D balloon inflate → pin keyframes → export `.glb` + JSON.**

Designed for the [K-OS-III](https://github.com/Koolskull/K-OS-III) music/visuals pipeline. Workflow and paper-stage UX inspired by [Monster Mash](https://monstermash.zone) (Google, Apache-2.0 spirit).

## Live demo

**GitHub Pages:** [https://koolskull.github.io/skullmash/](https://koolskull.github.io/skullmash/)

## Workflow

1. **Upload / drop an image** (or sample creature / blank paper)
2. **Draw** — freehand closed strokes over the photo
3. **Next → Inflate** — soft balloon mesh with photo vertex colors; orbit with drag
4. **Next → Animate** — place pins, record keyframes on the timeline
5. **Export** — binary glTF (`.glb`) + project JSON

Optional **Mint NFT** (user-initiated, for a fee) is planned — button is stubbed as SOON.

## Local dev

```bash
npm install
npm run dev
```

```bash
npm run build   # production → dist/
npm run preview
```

## Stack

React 19 · Vite · Three.js · earcut · Tailwind v4 · lucide

## Notes

- v0.3.0 — Monster Mash–style paper stage, image-first welcome, freehand inflate fix, GitHub Pages deploy
- Pair exported `.glb` with the JSON for pin playback in Stardrain / custom players
- Full OS shell integration lives in K-OS-III (`src/components/apps/skullmash/`)

Inspired by [google/monster-mash](https://github.com/google/monster-mash).
