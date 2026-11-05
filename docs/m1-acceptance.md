# Milestone 1 acceptance — locked loop v1

Product: [`locked-loop-v1.md`](locked-loop-v1.md).

Superseded, do not implement: solo strike tokens, “no private bot chat,” reveal-on-kick, crisis auto-kill, string-majority crisis.

- [ ] Rules module for talk → crisis → vote → night (kernel still role-agnostic)
- [ ] Lobby collects seats; start assigns a theme lore name + persona to every seat from a shared pool; no join after start
- [ ] Disconnect removes the seat with reason `disconnected`; no reconnect
- [ ] Player views hide `kind`; no `Grok-1` or other kind tells
- [ ] Bots prompted as bots with a team win (dead bots share it) and a strong never-confess line; prompt-injection risk accepted, no extra filter required
- [ ] Talk: private write, then batch reveal; 1 short message (~120–160 characters); attributed to the lore name
- [ ] No typing indicators and no live free-scroll during the talk window; free-scroll is not the scoring talk mode
- [ ] Crisis: one answer each; submit counters OK; answers attributed; an LLM judges whether they helped (not string majority)
- [ ] Crisis outcome is city points and/or slowdown — never an automatic human death
- [ ] City points can be spent to block the human targeted that night
- [ ] Vote: majority of living seats removes a seat; bot vs human stays hidden
- [ ] Night: living bots on an anonymous `Shadow A/B/…` channel, labels reshuffled each night; shadows are not told which seat the others are
- [ ] Shadows talk, then each votes a living human or passes; majority of living shadows decides; humans-only targets; tie or no majority → quiet night
- [ ] Humans see night as wait, then vanish or quiet; a point-spend blocks the kill and reads as quiet
- [ ] Team win checks after vote and night (humans: 0 living bots; bots: living humans ≤ living bots; dead bots share a bot win)
- [ ] UI shows phase, alive/dead, lore names, talk composer, crisis submit + counter, vote-by-seat, human night wait, city-point spend
- [ ] `npm start` still serves; demo via URL + `JOIN_PIN`
- [ ] Docs: locked loop linked from README and STATUS; plan banner notes what this supersedes
