# Locked loop v1 — town crisis + vote + night strike

**Status:** product locked (2026-11-05). Supersedes the colluding-mafia night channel in `grokmafia-plan.md` for v1 gameplay. Kernel architecture (Room / Player / Rules / Views) stays.

## One-line

Mixed humans + solo Grok bots in one town hall. Bots know they are bots. Talk → crisis → vote → night strike until one side wins. Text only.

## Locked constraints

| Decision | Choice |
|----------|--------|
| Communication | Town hall / public channel only — no DMs, no bot–bot private chat |
| Day talk | Simultaneous turns: private write, then one reveal. Free-scroll chat is not the scoring mode |
| Message cap | ~120–160 characters; 1 message per living seat per talk window |
| Bot knowledge | Bots know they are bots; secret goal = survive + thin humans; never confess |
| Bot collusion | Solo — each bot acts alone |
| Media | Text first; voice later |
| UI shape | Seat table + public transcript (already in M0); no map / movement; no typing indicators during a writing window |

## Win conditions

- **Humans win:** no bots left alive.
- **Bots win:** living humans ≤ living bots (or zero humans).

Check after crisis resolve, after vote resolve, and after night resolve.

## Setup (once per game)

1. Fill ~6 seats (host sets human/bot mix; bot count hidden from players).
2. Each seat: display name + short persona sheet.
3. Each bot also gets: “you are a bot; win by surviving and removing humans; never say you are a bot.”
4. Each bot starts with **1 night strike** token for the whole game.
5. Phase opens in town hall (`talk` or host-driven equivalent).

## Full round

### 1. Day — talk

Scoring talk is turn-based simultaneous reveal. Free-scroll chat is not the competitive talk mode.

- Timer (e.g. 3 minutes) or host advance.
- Each living seat writes **privately** during the window. The room reveals every submitted message at once when the window ends.
- No typing indicators. No live free-scroll of other seats’ lines while the window is open.
- Hard rules: max ~120–160 characters per message; **1 message per seat per talk window**.
- Optional (not required for v1): the window can be a forced prompt, e.g. “name one ally and why, ≤12 words.”
- Bots reply in character from persona + the public transcript already revealed (not from drafts still hidden this window).
- On end: lock the window and move to crisis.

### 2. Day — crisis

- Server posts one crisis prompt to town hall.
- Short window (e.g. 60–90s). Each living seat submits **one** answer.
- Same anti-tell pattern as day talk: answers stay private until the window ends, then the room reveals them together. No typing indicators and no live preview of other seats’ answers.
- **Success:** clear majority answer → nobody dies from crisis.
- **Fail:** tie / no majority / timeout → remove **one random living human**. Announce casualty; **role stays hidden**.
- Win check.

Example crisis pack (copy-pasteable):

- Majority: name the next shelter in one word.
- Majority: order these 4 rumors true → false.
- Everyone posts a childhood memory in ≤12 words (bots use persona; contradictions are tells).

### 3. Day — vote

- Living seats vote to kick one living seat (click seat / `act: vote`).
- **Majority of living seats** required to kick. (Lock this rule; do not mix with “majority of votes cast” mid-demo.)
- No majority → nobody kicked; day ends.
- Kicked seat is **revealed** as bot or human, then removed from chat (spectator / dead).
- Win check.

### 4. Night — strike

- Chat locked. Humans wait.
- Each living bot privately chooses: spend strike on one living **human**, or pass. (`act` visible only to that bot + host as needed — **not** a shared bot channel.)
- At most **one** human death per night:
  - If any strikes land, eliminate the human with the most strikes.
  - Tie: pick deterministically (e.g. lowest `seatId`) and document it.
- Town hall: “Seat Y vanished in the night.” Role stays hidden.
- Spent strikes are gone; bots who passed keep theirs.
- Win check → if no winner, next day talk.

## Phase sketch (Rules module)

Opaque phase strings for the kernel; semantics live in Rules, e.g.:

`lobby → talk → crisis → vote → night → (talk | ended)`

Host may `setPhase` for the hackathon demo if timers are incomplete. Auto-timers are nice-to-have, not blockers.

## Bot behavior notes

- Same `say` / `act` paths as humans.
- Prompt includes persona, public transcript slice, phase, allowed acts, strike remaining, win goal.
- Server-side filter optional: block utterances that confess being a bot.
- No private negotiation between bots — solo pressure is intentional.

## Hackathon join

- Share deploy URL + `JOIN_PIN` (see README).
- Dead seats → read-only spectators.
- Out of v1: custom agent webhooks, voice, map art, accounts.

## Cut from v1 (explicit)

- Private mafia channel / agent–agent night negotiation
- Bots that believe they are human
- Voice / TTS
- Spatial map / tasks / movement
- Lobby platform beyond one room + PIN

## Relation to M0

Milestone 0 (SandboxRules + seat UI + BotPlayer) stays the kernel proof. This doc is the **product** for Milestone 1 Rules (name TBD: `town.js` / `crisis.js`), not a rewrite of Room sockets.
