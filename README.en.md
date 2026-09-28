# SuperBirdCamera · Lens Optics 3D Studio

> A web tool that estimates camera-lens barrel geometry from optical parameters and renders interactive 3D models for comparison.  
> **Default documentation is Chinese** — see [README.md](./README.md) for the full guide. This file is the English version.

---

## Features

### Optical estimation
- Gaussian + engineering segment formulas from **mount, focal length, aperture, zoom position, focus distance, TC / reducer**
- Outputs: effective focal length and f-number, entrance pupil, front diameter, body length segments, FOV, image distance, magnification, BFL reference
- Zoom interpolation; **internal / external** barrel styles
- Teleconverters (1.4× / 2×) and reducers (0.7× / 0.5×) keep physical rules (f and N scale together; entrance pupil preserved)

### 3D scene
- Procedural modern barrels (rings, bayonet, coated front element)
- **300mm+ super-tele** continuous taper profile + GM-style details; optional **cutaway** optical groups
- Dimension annotations: L / Ø front / Ø mount / Ø entrance pupil / Ø rear (mm)
- Cross rulers (X and Z meeting at **0**), ground grid
- ~120mm reference bird for scale

### Multi-lens comparison
- Unlimited lenses; cards support **select & edit**, **drag reorder** (or ←/→)
- Align **mount / front / center**; orthographic top view; wireframe overlay; live zoom

### UI
- Chinese-first dark engineering theme
- Responsive **desktop + mobile** (drawer panel, touch targets)
- Perspective / top / front / side views

---

## Quick start (Windows)

Requirements: **Node.js 18+**

```bat
build.bat
dist\run.bat
```

`build.bat` installs deps, runs `tsc` + `vite build`, copies launchers into `dist\`.  
`dist\run.bat` serves the static build (ports 8765–8776), prints **Local / LAN / Public** URLs, and opens the browser.

Always start from **`dist\run.bat`**. Root `run.bat` refuses the Vite source `index.html` (`/src/main.ts` is not compiled JS).

### npm scripts

```bash
npm install
npm run dev
npm run build
npm test
```

For flaky networks:
```bat
set NPM_REGISTRY=https://registry.npmmirror.com
build.bat
```

### URL presets

| Query | Effect |
|-------|--------|
| `?demo=1` | Two demo lenses (600/0.9, 70–200) |
| `?gallery=1` | Gallery (85, 24–70, 70–200) |
| `?one=600,4` | Single prime |
| `&view=side` | `side` / `top` / `front` / `perspective` |
| `&interior=1` | Optical cutaway |

Example: `http://127.0.0.1:8765/?one=600,4&view=side&interior=1`

---

## Project layout

```
src/
  optics.ts           # pure optical math (core)
  mounts.ts           # flange / throat data
  ui/app.ts           # forms, cards, select/reorder
  three/
    scene.ts          # cameras, lights, align, toggles
    lensBuilder.ts    # standard barrels
    superTele.ts      # 300mm+ shell + elements
    dimensions.ts     # CAD-style callouts
    rulers.ts         # X/Z scales, text sprites
    bird.ts           # scale reference
```

---

## Development & extension

| Goal | Where |
|------|--------|
| Change length / diameter formulas | `src/optics.ts` → `computeOptics` |
| Add a mount | `src/mounts.ts` + `MountId` |
| Restyle normal lenses | `src/three/lensBuilder.ts` |
| Super-tele profile & cutaway | `src/three/superTele.ts` (`AXIAL`) |
| Dimension labels | `src/three/dimensions.ts` |
| Rulers | `src/three/rulers.ts` |
| UI / mobile | `src/ui/app.ts`, `src/style.css` |

Run `npm test` and `npm run build` after changes. Prefer unit tests for optics; mesh smoke tests for builders.

### Cloud deploy
1. Copy the full project folder  
2. `build.bat` (retry / mirror registry if npm fails)  
3. `dist\run.bat` (binds all interfaces, prints public URL)  
4. Allow **TCP 8765–8776** in firewall / cloud security group  

---

## License

Per repository policy. Models are procedural approximations, not manufacturer CAD.
