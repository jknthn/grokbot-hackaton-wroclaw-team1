# Grokbot Hackathon — Wrocław Team 1

Multiagent social deduction (Mafia-shaped) on a game-agnostic kernel: humans and bots are both `Player`s.

## Docs

- **[Current status](docs/STATUS.md)** — live URL, PIN, M0 done / M1 next
- [Project plan](docs/grokmafia-plan.md)
- [M0 acceptance](docs/m0-acceptance.md)
- [Pitch v0](docs/pitch-v0.md)

## Live demo

https://grokmafia-kernel.onrender.com · PIN **`4821`**  
(Cold start on free Render can take ~1 minute.)

## Quick start (local)

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000` with `JOIN_PIN` (default `4821`).

Local-only bind by default. Optional tunnel: `ngrok http 3000`.

## Deploy (recommended for teammates / demo)

Grok replies work anywhere the server can call `api.x.ai` with `GROK_API_KEY`. Prefer a real host over ngrok for a stable URL.

### Option A — Render (GitHub Blueprint)

1. Repo must be on GitHub `master` with `render.yaml` at the root (already pushed).
2. [Render → New → Blueprint](https://dashboard.render.com/blueprints/new) → pick `jknthn/grokbot-hackaton-wroclaw-team1`.
3. Form fields:
   - **Blueprint Name:** `grokmafia` (any unique name)
   - **Branch:** `master`
   - **Blueprint Path:** leave empty (uses root `render.yaml`)
4. Under services, **select / check** `grokmafia-kernel` so it is not “0 services selected”.
5. **Deploy Blueprint**.
6. Open the service URL; join with PIN `4821`. Optional: set `GROK_API_KEY` in the service env.

Free tier may cold-sleep (~1 min wake); hit the URL once before the demo.

### Option B — Railway

```bash
# once: npm i -g @railway/cli && railway login
railway init
railway up
railway variables set JOIN_PIN=4821 NODE_ENV=production HOST=0.0.0.0
# optional: railway variables set GROK_API_KEY=...
railway domain
```

Or connect the GitHub repo in the Railway dashboard (Dockerfile is provided).

### Option C — Docker anywhere

```bash
docker build -t grokmafia .
docker run --rm -p 3000:3000 -e JOIN_PIN=4821 -e GROK_API_KEY "$GROK_API_KEY" grokmafia
```

## Env

See [`.env.example`](.env.example). Important:

| Var | Purpose |
|-----|---------|
| `JOIN_PIN` | Required to join (share with players) |
| `GROK_API_KEY` | Live bot lines; omit = canned |
| `HOST` | `127.0.0.1` local / `0.0.0.0` deploy |
| `PORT` | Set by platform in deploy |
