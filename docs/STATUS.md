# Current status — 2026-11-05

## Where we are

**Milestone 0 is live** (game-agnostic kernel + SandboxRules).

| Item | Value |
|------|--------|
| App URL | https://grokmafia-kernel.onrender.com |
| Join PIN | `4821` (also accepts whatever Render has in `JOIN_PIN`) |
| Host | Render free web service (`frankfurt`), Blueprint from `render.yaml` |
| Branch | `master` @ `ef83604`+ |

### M0 acceptance

- [x] `npm start` / Render serves page + WebSocket
- [x] Humans join, seat circle, public chat in phase **talk**
- [x] Host can set `lobby \| talk \| done`
- [x] Bot seat (`Grok-1`) on same Player API; canned lines without `GROK_API_KEY`
- [x] Rules via `SandboxRules` only — no Mafia hardcoded in kernel
- [x] `act: ready` wired for later votes
- [x] Remote join via public URL + PIN (deploy, not ngrok)

### How to play right now

1. Open https://grokmafia-kernel.onrender.com (first hit may take ~1 min if cold).
2. Enter name + PIN `4821`. First human is host.
3. Host clicks **Talk** → chat. Bot speaks on an interval.

Optional: set `GROK_API_KEY` in Render → Environment for live Grok lines.

## What is not done yet (Milestone 1)

Product lock: [`locked-loop-v1.md`](locked-loop-v1.md) · checklist: [`m1-acceptance.md`](m1-acceptance.md).

Swap/add town Rules (name TBD) — **not** private mafia night:

- Phases `talk → crisis → vote → night`
- Crisis majority / fail → random human casualty (role hidden)
- `act: vote` — majority of living seats; reveal on kick
- Night strike: each bot, 1 token, target **any** living seat (no kind roster); ≤1 death
- Bots know they are bots; infer allies in public; no private bot channel
- Win checks after crisis / vote / night

Kernel / sockets / seat UI should stay; only `server/rules/` + bot prompts grow.

## Ops notes

- Free Render **spins down after ~15 min idle** — wake before demos.
- Local still: `npm start` → `http://127.0.0.1:3000` (localhost bind); ngrok optional.
- PIN gotcha: first Blueprint used `generateValue` for `JOIN_PIN`; code now always also accepts `4821`. Prefer setting `JOIN_PIN=4821` explicitly in the Render dashboard.
