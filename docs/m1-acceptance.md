# Milestone 1 acceptance — locked loop v1

Product: [`locked-loop-v1.md`](locked-loop-v1.md).

Superseded, do not implement: solo strike tokens, “no private bot chat,” reveal-on-kick, crisis auto-kill, string-majority crisis.

- [ ] Rules module for talk → crisis → vote → night (kernel still role-agnostic)
- [ ] Each joiner opens two connections: a human seat and their bot seat. Counts come from completed pairs; the server balances the table
- [ ] v1 bot is in-process and paired to that joiner. A bring-your-own bot endpoint is out of v1
- [ ] Lobby collects pairs; no join after start. Start assigns a theme, then random lore names and personas from a shared pool, then shuffles
- [ ] After the shuffle, the human is not told which seat is their bot (default)
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
