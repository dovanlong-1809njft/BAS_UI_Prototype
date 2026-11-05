# CODEx RULES — BAS UI Prototype V1

This repository is an intentionally small **frontend-only** React/Vite starter.
Follow these constraints unless the user explicitly changes them.

## Highest priority: no file sprawl
1. Read this file and `README.md` before editing.
2. **Reuse and edit existing files first.** Do not generate new folders, duplicate components, `utils` directories, extra CSS files, or docs by default.
3. Before adding a file, state: its exact path, why existing files cannot hold the change, and ask permission. Exceptions: generated `package-lock.json` after `npm install` (expected); `dist/` and `node_modules/` (ignored build dependencies).
4. Keep the existing folder tree and one central stylesheet `src/styles.css`.
5. Do not introduce state libraries, chart libraries, UI kits, routing, backend, SQL, MQTT, API integration, Docker, tests, or CI unless asked.
6. Make only requested changes. Do not rename, remove or relocate existing files without permission.
7. Never commit, push, switch branches, or manipulate Git unless explicitly requested.

## Current architecture
- `src/App.jsx`: overall page composition / demo mode label.
- `src/components/ShipScene.jsx`: Three.js scene, camera modes and interaction UI.
- `src/components/TelemetryPanel.jsx`: derived telemetry and status display.
- `src/simulation/state.js`: one shared simulation state and its deterministic calculations. Avoid multiple competing states.
- `src/assets/models/`: approved `.glb` models only (not Unity source assets).
- `src/styles.css`: **only** application styling file.

## Functional and visual requirements for later tasks
- Palette: black, white, gray. Green/yellow/red only for semantic alerts and state. **No blue theme.**
- Data is always labeled `SIMULATION / DEMO DATA`, not actual telemetry.
- Ship must be controllable via keyboard; mouse controls camera separately.
- Top / 3D / Side camera views must refer to the same ship coordinates.
- Bow and stern distances, approach speed, angle and alert state must derive from one simulation state. Define coordinate convention and units clearly.
- This is a **visual prototype**, not a vessel-navigation or safety-critical system.
- Ensure basics work on desktop and avoid unreadable UI.

## Completion report
At the end of each task report only: files modified, functionality implemented, how to verify, and remaining limitations. Do not create extra summary files.
