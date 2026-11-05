# GrokMafia — humans vs Grok at one table

**Hackathon:** Wrocław · Team 1  
**One-liner:** A social-deduction town where every seat looks human — some are powered by Grok — and nobody’s view shows who’s who.

Live demo: **https://grokmafia-kernel.onrender.com** · door code **`4821`**  
TV / projector feed: **https://grokmafia-kernel.onrender.com/stream**  
*(Free Render may cold-start ~30–60s — hit the URL once before judging.)*

---

## Why this exists

Most “AI multiplayer” demos are one chatbot in a lobby.  
**GrokMafia** puts humans and bots on the **same rules, same lore names, same table**. Kind is hidden. Bots must blend by day and conspire anonymously by night. The town wins by surviving nights / banking city points / wiping shadows; shadows win by thinning the humans.

It’s a playable **multiagent social game**, not a chat wrapper.

---

## 2-minute judge path

1. Open the live URL (wake it if cold). Optionally open **`/stream`** on a second screen.
2. Join with a name + PIN `4821` (check **host** on the first machine).
3. Host: **ADD BOT** until the table feels packed → humans press **READY** (or host **START**).
4. Watch the loop: **blind talk → crisis → vote → night → dawn**.
5. On the player UI you’ll see a **YOU ARE** card + floating pin over your seat in the 3D dining hall.

One person joining seats **you + your shadow bot**. Lore theme (Wild West / Space Colony / North Jersey / Deep Harbor) is picked at start; names shuffle so the table doesn’t leak who’s silicon.

---

## How a round feels

| Phase | What happens |
|--------|----------------|
| **Lobby** | Pairs join. Host packs bots / picks theme. READY / START. |
| **Day talk** | Everyone writes **one sealed line**; batch reveal. Prompt is theme-aware (GM + lore banks). |
| **Crisis** | Town answers a soft crisis. An LLM judges → **city points** + real **tempo** (longer/shorter windows). MVP / coast callouts. Nobody dies here. |
| **Vote** | Majority (plurality path for demos) removes a seat. **Kind stays hidden.** |
| **Night** | Living bots meet as reshuffled **Shadow A/B/…**, talk privately, strike a human (or pass). City can **spend 1 point** to block. |
| **Win** | Humans: wipe bots, or survive the night clock / hit the city-point goal on underdog tables. Bots: wipe humans (dead bots still share the win). |

---

## What we built (demo surface)

- **3D dining hall** (Three.js) for players — click seats to vote; vote strip on smaller screens.
- **`/stream` TV mode** — same hall, public-only HUD for projectors (no private kind / shadow chat).
- **In-process Grok bots** with seeded personalities + full public transcript context.
- **Game Master** auto-advances phases; hosts can still override for live demos.
- **Session resume** — refresh keeps your seat via token.
- **Kernel design** — Room / Player / Rules / Views; TownRules is the product loop; SandboxRules still proves the kernel.

---

## Stack

Node · Express · Socket.IO · Three.js · xAI Grok (`GROK_API_KEY`, optional — offline fallbacks exist)

```bash
npm install
npm start          # http://127.0.0.1:3000
npm test           # kernel + loop selftests
```

| Env | Purpose |
|-----|---------|
| `JOIN_PIN` | Door code (default / demo `4821`) |
| `GROK_API_KEY` | Live bot + crisis judge + GM prompts; omit = canned |
| `GM_AUTO` | Set `0` to disable auto phase advance |
| `HOST` / `PORT` | Deploy bind (`0.0.0.0` in prod) |

Deploy notes (Render / Railway / Docker): see below for maintainers. Judges only need the live URL + PIN.

---

## Design constraints (on purpose)

- **Kind hidden** in player views — no “bot badge” on the table.
- **Bots know they are bots** and must never confess; night labels reshuffle so shadows don’t map to seats.
- Crisis is **soft stakes** (points / tempo), not an auto-kill.
- Text-first; voice / BYO bot endpoint are later.

Product lock: [`docs/locked-loop-v1.md`](docs/locked-loop-v1.md) · 90s pitch: [`docs/pitch-v0.md`](docs/pitch-v0.md)

---

## Team / repo

Hackathon Wrocław — Team 1 · repo: this project on `master`.

### Maintainer deploy (optional)

**Render:** Blueprint from `render.yaml` · set `JOIN_PIN` + optional `GROK_API_KEY`.  
**Docker:** `docker build -t grokmafia . && docker run --rm -p 3000:3000 -e JOIN_PIN=4821 -e GROK_API_KEY=$GROK_API_KEY grokmafia`

Local bind defaults to localhost; use `HOST=0.0.0.0` on a VPS.
