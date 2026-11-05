# Milestone 1 acceptance — locked loop v1

Product: [`locked-loop-v1.md`](locked-loop-v1.md).

- [ ] Rules module for talk → crisis → vote → night (kernel still role-agnostic)
- [ ] Day talk is simultaneous reveal: each living seat writes privately; all messages appear together when the window ends
- [ ] No typing indicators and no live free-scroll of others’ lines during a talk or crisis writing window
- [ ] Talk hard rules: ~120–160 characters max; 1 message per seat per talk window
- [ ] Forced talk prompt (e.g. “name one ally and why, ≤12 words”) is optional, not required for v1
- [ ] Free-scroll chat is not the competitive / scoring talk mode
- [ ] Crisis answers use the same simultaneous-reveal submit window
- [ ] No private bot–bot channel; night strike is a per-bot private `act`
- [ ] Bots prompted as bots with solo win goal; no confession; **no kind roster** in prompt
- [ ] Emergent public coordination after inferring another bot is allowed (no private channel)
- [ ] Crisis: majority success / fail → random human casualty on fail; role hidden
- [ ] Vote: majority of living seats kicks; reveal bot vs human
- [ ] Night: strike any living seat (or pass); ≤1 death; most strikes wins; tie rule documented; role hidden
- [ ] Win checks after crisis, vote, night (humans: 0 bots; bots: humans ≤ bots)
- [ ] Each bot starts with 1 strike token for the game
- [ ] UI shows phase, alive/dead, crisis submit, vote-by-seat, night wait for humans
- [ ] `npm start` still serves; demo via URL + `JOIN_PIN`
- [ ] Docs: locked-loop linked from README; STATUS + plan note supersession
