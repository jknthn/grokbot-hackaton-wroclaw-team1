# UI guidelines — pixel town hall (non-blocking)

**Status:** direction + first CSS pass on `master` (2026-11-05). Does **not** block Milestone 1 rules or the locked loop in `docs/locked-loop-v1.md`.

## Scope

- Skin the existing M0 shell: **seat table + transcript + phase/host strip + join screen**.
- No map, movement, proximity chat, or Among Us tasks.
- No requirement to implement simultaneous-reveal chrome before M1 — leave style hooks only.

## Product cues (from locked loop)

Town hall energy: shared table, public transcript, phase drama (`talk` → `crisis` → `vote` → `night`). Text-first. No typing indicators during a writing window (when that mode exists).

## Look

| Token | Guidance |
|-------|----------|
| Style | Pixel / retro HUD — chunky, readable, slightly tense at night |
| Borders | 2–4px solid; hard offset shadows; **no** soft blur / glow stacks |
| Radius | Prefer `0`–`2px`; avoid pill buttons |
| Display font | e.g. Press Start 2P (titles, phase HUD) |
| Body font | e.g. VT323 or another readable mono for transcript |
| Motion | Optional 1–2 bits: phase label blink, seat flash on reveal — not continuous shimmer |

### Palette (starting point)

```css
--bg: #0f0c0a;
--panel: #1c1510;    /* wood paneling */
--ink: #f5ecd9;
--muted: #9a8770;
--accent: #c9a227;   /* gold chain / club trim */
--neon: #8b1e2d;     /* burgundy booth / club door */
--line: #3d2f24;
```

Vibe: **North Jersey sit-down** (Sopranos-adjacent) — mahogany, gold, burgundy, industrial skyline, round “SIT-DOWN” table. Title in Cinzel; HUD/labels stay pixel (Press Start / VT323). Avoid trademarked names and purple “AI” looks.

## Chrome

- **Phase HUD:** pixel label e.g. `TALK` · `CRISIS` · `VOTE` · `NIGHT` · `REVEAL` (map whatever opaque phase string Rules use).
- **Seats:** blocky tokens; short name or initials. Do **not** paint obvious human/bot chrome in-game unless Rules say kinds are public (v1: bots are hidden).
- **Join:** same skin; chunky PIN field; product / table name as a strong first-viewport signal.
- **Transcript:** mono lines; later simultaneous-reveal can use a “sealed / locked window” panel state — style only until logic lands.

## Out of scope for a styling pass

- New phase machines, vote/crisis logic, Grok prompt work.
- Asset pipelines, sprite sheets, sound.
- Blocking merges of gameplay/docs PRs.

## Ship bar

- Current join → talk → chat flow still works on desktop and a phone-width viewport.
- CSS-only (plus font links) preferred for the first pass; deployable without env changes.
