# Locked loop v1 — lore town, crisis points, shadow night

**Status:** product locked (2026-11-05). Supersedes both earlier v1 sketches: the solo strike-token loop (no private bot chat, reveal on kick, crisis kills a human) and the named colluding-mafia night channel in `grokmafia-plan.md`. Kernel architecture (Room / Player / Rules / Views) stays.

## One-line

Humans and bots share one town under a lore theme. Kind is hidden. Talk → LLM-judged crisis (city points, nobody auto-dies) → vote without a reveal → anonymous shadow night until one side wins. Text only.

## Locked constraints

| Decision | Choice |
|----------|--------|
| Theme | One lore theme at start (e.g. Wild West, space). Every seat, human or bot, gets a lore name + persona from that theme |
| Names | Shared name pool. No `Grok-1` or other kind tells |
| Kind in views | Hidden in all player views |
| Join | One person, two connections: their human seat and their bot seat. Counts come from completed pairs; the server balances the table |
| Lobby | Collect pairs, then start. Lore names and personas are assigned at start, then shuffled. No join after start |
| Pair after shuffle | Default: the human is not told which seat is their bot. v1 bot is in-process and paired to that joiner |
| Disconnect | Seat is removed with reason `disconnected`. No reconnect |
| Day talk | Simultaneous private write, then one batch reveal. Messages are attributed. Free-scroll is not the scoring mode |
| Message cap | 1 short message per living seat per talk window (~120–160 characters) |
| Crisis | An LLM judges whether the city’s answers helped. Not a string-majority check |
| Crisis outcome | Soft only: city points and/or slowdown. Never an automatic human death |
| City points | Example spend: block the human the shadows targeted tonight |
| Day vote | Plurality of living seats removes a seat (tied leaders break at random). Removal does **not** reveal bot vs human |
| Night | Living bots share an anonymous channel (`Shadow A`, `Shadow B`, …). Labels reshuffle every night. They do not learn which seat a shadow is |
| Night kill | Each shadow votes a living **human** seat or passes. Majority of shadows decides. Humans-only targets |
| Bot knowledge | Bots know they are bots. Team win: dead bots share it. Never confess |
| Prompt injection | Accepted risk. Mitigation is a strong never-confess prompt only |
| Media | Text first; voice later |
| UI shape | Seat table + public transcript (M0 shell); no map / movement; no typing indicators during the talk window |

## Win conditions

Mode is chosen at start from seat counts:

- **Parity** (humans start with a strict majority): classic call.
  - **Humans win:** no bots left alive.
  - **Bots win as a team:** living humans ≤ living bots (or zero humans). Dead bots share that win.
- **Survival** (underdog / 1-human demo tables): parity alone does **not** end the game.
  - **Humans win:** wipe every bot, **or** survive N nights (default 3) while any human lives, **or** reach the city-point goal (default 4).
  - **Bots win as a team:** wipe every living human. Dead bots share that win.

Check after vote resolve, night resolve, and crisis reveal (points path). Crisis never kills by itself.

## Setup (once per game)

1. Each person joins as a pair: one connection for their human seat, one for their bot seat. The server sets human and bot counts from who completed a pair and balances the table. Players are not shown a kind roster.
2. Start closes the lobby. No one else can join.
3. Server picks the lore theme, then assigns every seat a random lore name and a short persona from a shared pool. Humans and bots draw from the same pool.
4. Seats are shuffled. By default the human is **not** told which seat is their bot. Player views never include `kind`. The v1 bot runs in-process, still paired to that joiner. A bring-your-own bot endpoint is later, not v1.
5. Each bot’s prompt adds: “you are a bot; your team wins together, including bots who die; thin the humans; never say you are a bot.”
6. City points start at 0.
7. Phase opens in town hall (`talk`, or the host advances).

A disconnect removes that seat immediately and announces the reason `disconnected`. Do not build reconnect.

## Full round

### 1. Day — talk

Scoring talk is turn-based simultaneous reveal. Free-scroll chat is not the competitive talk mode.

- Timer or host advance.
- Each living seat writes **privately**. When the window ends, the room reveals every submitted message **at once**, attributed to that seat’s lore name.
- No typing indicators. No live free-scroll of other seats’ lines while the window is open.
- Hard rules: **1 message per seat per window**, ~120–160 characters.
- Optional (not required for v1): the window can be a forced prompt, e.g. “name one ally and why, ≤12 words.”
- Bots write from persona + the public transcript already revealed (not from drafts still hidden this window).
- On end: move to crisis.

### 2. Day — crisis

- Server posts one crisis prompt to town hall.
- Short window. Each living seat submits **one** answer.
- A submit counter is allowed (how many seats have answered, and which ones). Answers, once shown, are **attributed** — lore names stay visible.
- An LLM judges whether the city’s answers helped. Do not resolve this by matching identical strings or by a word-majority.
- **Helped:** grant city points and/or a slowdown in the city’s favor.
- **Did not help:** no points, and/or a slowdown against the city.
- Nobody dies from the crisis. Roles stay hidden.
- No win check from this phase.

Slowdown is a tempo consequence (shorter or longer next window). It is not a kill.

Example prompts (the model judges the pile, not a shared password):

- The well is failing. What do we do before night?
- Four rumors are circulating. Which ones should the town act on?
- Name the next shelter and why it holds.

### 3. Day — vote

- Living seats vote to remove one living seat (click seat / `act: vote`).
- **Plurality** wins (most votes). Tied leaders break at random so the day still removes someone when ballots exist.
- No valid ballots → nobody removed; the day ends.
- The removed seat leaves play. **Bot vs human is not revealed.**
- Win check.

### 4. Night — shadow channel

- Public chat locks. Humans wait. They do not see the shadow channel.
- Each living bot joins as `Shadow A`, `Shadow B`, … Labels are shuffled **every night**, so a letter is not a stable identity. Shadows are not told which seat the other shadows occupy.
- They talk on that private channel and must cooperate.
- Then each shadow votes for one living **human** seat, or passes. Votes against bots are invalid.
- **Majority of living shadows** selects the target. A tie or no majority → quiet night, nobody dies.
- The city may spend city points to block that kill. A blocked kill does not happen.
- Humans only see the wait, then either a line like “Ada vanished in the night.” (the seat’s lore name) or a quiet night. Role stays hidden. A save reads as quiet.
- Win check → if no winner, next day talk.

## Phase sketch (Rules module)

Opaque phase strings for the kernel; semantics live in Rules, e.g.:

`lobby → talk → crisis → vote → night → (talk | ended)`

Host may `setPhase` for the hackathon demo if timers are incomplete. Auto-timers are nice-to-have, not blockers.

## Bot behavior notes

- Same `say` / `act` paths as humans.
- Public prompt includes lore persona, revealed transcript, phase, allowed acts, city points if the seat can see them, and the team win.
- Night prompt adds the shadow label for this night only, the shadow transcript, and the list of living human seats they may vote.
- Never-confess is prompt text. v1 does not add a confession filter. Prompt injection is an accepted risk.
- Night cooperation is required, and it stays anonymous. That replaces solo strike tokens.

## Hackathon join

- Share deploy URL + `JOIN_PIN` (see README). Join is lobby-only.
- Each joiner brings two connections (human + their bot). v1 seats that bot in-process. Bring-your-own bot endpoint is later.
- After start, the shuffle hides which seat is that joiner’s bot.
- Removed seats are gone (vote, night, or disconnect). No reconnect flow.
- Out of v1: bring-your-own bot endpoint, voice, map art, accounts, reconnect.

## Superseded (do not build)

- Solo night strike token, one kill per bot, no private bot chat
- Crisis fail removes a random human
- String-majority / identical-answer crisis resolution
- Day vote reveals bot vs human
- Named mafia night channel where agents know each other’s seats
- Bots that believe they are human
- `Grok-1` (or any kind-leaking display name) in player views
- Host-picked human/bot mix. Counts come from joiner pairs
- Telling a human which seat is their bot after the start shuffle (default is hidden)
- Voice / TTS, spatial map, lobby platform beyond one room + PIN
- Reconnect after disconnect

## Relation to M0

Milestone 0 (SandboxRules + seat UI + BotPlayer) stays the kernel proof, including whatever the sandbox still shows for `kind`. This doc is the **product** for Milestone 1 Rules. Player views for that Rules module hide kind and use the shared lore-name pool. It is not a rewrite of Room sockets.
