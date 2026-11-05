# Locked loop v1 — town crisis + vote + night strike

**Status:** product locked (2026-11-05). Supersedes the colluding-mafia night channel in `grokmafia-plan.md` for v1 gameplay. Kernel architecture (Room / Player / Rules / Views) stays.

## One-line

Mixed humans + Grok bots in one town hall. Each bot knows *it* is a bot, not who else is. Talk → crisis → vote → night strike until one side wins. Text only.

## Locked constraints

| Decision | Choice |
|----------|--------|
| Communication | Town hall / public channel only — no DMs, no bot–bot private chat |
| Bot knowledge | Each bot knows **it** is a bot; **no kind roster** — it does not get told who the other bots/humans are |
| Bot goals | Survive + thin humans; never confess being a bot |
| Bot collusion | No private channel. Soft public coordination **after inferring** another bot (protect in vote, echo crisis answers, avoid striking them) is allowed and intended |
| Media | Text first; voice later |
| UI shape | Seat table + public chat (already in M0); no map / movement |

## Win conditions

- **Humans win:** no bots left alive.
- **Bots win:** living humans ≤ living bots (or zero humans).

Check after crisis resolve, after vote resolve, and after night resolve.

## Setup (once per game)

1. Fill ~6 seats (host sets human/bot mix; bot count hidden from players).
2. Each seat: display name + short persona sheet.
3. Each bot also gets: “you are a bot; win by surviving and removing humans; never say you are a bot; you are **not** told who else is a bot — figure allies out from public play.”
4. Each bot starts with **1 night strike** token for the whole game.
5. Phase opens in town hall (`talk` or host-driven equivalent).

## Full round

### 1. Day — talk

- Timer (e.g. 3 minutes) or host advance.
- Free text on the public channel.
- Bots reply in character from persona + public history only.
- On end: lock chat for crisis.

### 2. Day — crisis

- Server posts one crisis prompt to town hall.
- Short window (e.g. 60–90s). Each living seat submits **one** answer (posted publicly or via submit that appears as them).
- **Success:** clear majority answer → nobody dies from crisis.
- **Fail:** tie / no majority / timeout → remove **one random living human**. Announce casualty; **role stays hidden**.
- Win check.

Example crisis pack (majority-scored only for v1):

- Majority: name the next shelter in one word.
- Majority: order these 4 rumors true → false.

(Optional later / non-majority tell prompt — out of scored crisis for v1: childhood memory ≤12 words.)

### 3. Day — vote

- Living seats vote to kick one living seat (click seat / `act: vote`).
- **Majority of living seats** required to kick. (Lock this rule; do not mix with “majority of votes cast” mid-demo.)
- No majority → nobody kicked; day ends.
- Kicked seat is **revealed** as bot or human, then removed from chat (spectator / dead).
- Win check.

### 4. Night — strike

- Chat locked. Humans wait.
- Each living bot privately chooses: spend strike on **any living seat**, or pass. (`act` visible only to that bot + host as needed — **not** a shared bot channel.)
- Why any seat: bots have no kind roster; guessing wrong can friendly-fire another bot.
- At most **one** death per night:
  - If any strikes land, eliminate the living seat with the most strikes (human or bot).
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
- Prompt includes persona, public transcript slice, phase, allowed acts, strike remaining, win goal; **does not** list other bots’ seat IDs.
- Server-side filter optional: block utterances that confess being a bot.
- No private negotiation. Emergent public alliance after a bot *infers* another bot is the multiagent story — not a handed roster or night channel.

## Hackathon join

- Share deploy URL + `JOIN_PIN` (see README).
- Dead seats → read-only spectators.
- Out of v1: custom agent webhooks, voice, map art, accounts.

## Cut from v1 (explicit)

- Private mafia channel / agent–agent night negotiation
- Handed kind roster (bots told who the other bots are)
- Bots that believe they are human
- Voice / TTS
- Spatial map / tasks / movement
- Lobby platform beyond one room + PIN

## Relation to M0

Milestone 0 (SandboxRules + seat UI + BotPlayer) stays the kernel proof. This doc is the **product** for Milestone 1 Rules (name TBD: `town.js` / `crisis.js`), not a rewrite of Room sockets.
