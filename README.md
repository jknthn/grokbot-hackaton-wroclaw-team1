# Grokbot Hackathon — Wrocław Team 1

Multiagent social deduction (Mafia-shaped) on a game-agnostic kernel: humans and bots are both `Player`s.

## Docs

- [Locked loop v1 (product)](docs/locked-loop-v1.md) — crisis + vote + night strike
- [Project plan (Milestone 0+ / kernel)](docs/grokmafia-plan.md)
- [M0 acceptance](docs/m0-acceptance.md)
- [Pitch v0](docs/pitch-v0.md)

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

1. Push this repo to GitHub (already on `origin`).
2. [Render → New → Blueprint](https://dashboard.render.com/select-repo?type=blueprint) → select this repo (`render.yaml`).
3. Set env:
   - `JOIN_PIN` — pick a PIN (or use the generated one from the blueprint)
   - `GROK_API_KEY` — optional; without it the bot uses canned lines
4. Deploy → share `https://<service>.onrender.com` + PIN.

Free tier may cold-sleep; wake with one request before the demo.

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
