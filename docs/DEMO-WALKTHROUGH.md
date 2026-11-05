# mw-ui mock walkthrough (`/demo`)

Isolated **mock** demo of the **mw-ui** Three.js dining-hall UI. Does not join the live room or call models.

## Run locally (private)

```bash
npm install
HOST=127.0.0.1 JOIN_PIN=4821 node server/index.js
```

Open **http://127.0.0.1:3000/demo** (not the production Render URL).

1. Click **Enter demo** or **COME IN**.
2. Click **NEXT STEP →** to advance lobby → deal → blind write → reveal → crisis → vote → night → ended.
3. On blind/crisis steps you can use **SUBMIT** (mock advances one step).
4. On **Vote**, click a guest in the 3D table (or keep using NEXT STEP).
5. Optional **Observer roles** checkbox shows fictional human/bot labels in the corner panel only (never on seats).

Live gameplay remains at **http://127.0.0.1:3000/** with real Socket.io.

## Files

- `public/demo.html` — walkthrough chrome + same `app.js` / `scene.js` as mw-ui
- `public/demo-walkthrough.js` — mock `io()` adapter and fixture views
- `public/demo.css` — demo bar styling

## Limitations

- Host buttons do not drive the script (use NEXT STEP).
- Vote/night rules are scripted, not server `TownRules`.
- SAY is disabled whenever the real rules would (window phases use SUBMIT only).
- Prior saloon-voxel WIP is stashed on branch `cursor/saloon-voxel-table-af34` (`git stash list`).
