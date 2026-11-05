# Milestone 1 acceptance — locked loop v1

Product: [`locked-loop-v1.md`](locked-loop-v1.md).

- [ ] Rules module for talk → crisis → vote → night (kernel still role-agnostic)
- [ ] No private bot–bot channel; night strike is a per-bot private `act`
- [ ] Bots prompted as bots with solo win goal; no confession
- [ ] Crisis: majority success / fail → random human casualty on fail; role hidden
- [ ] Vote: majority of living seats kicks; reveal bot vs human
- [ ] Night: ≤1 human death; most strikes wins; tie rule documented; role hidden
- [ ] Win checks after crisis, vote, night (humans: 0 bots; bots: humans ≤ bots)
- [ ] Each bot starts with 1 strike token for the game
- [ ] UI shows phase, alive/dead, crisis submit, vote-by-seat, night wait for humans
- [ ] `npm start` still serves; demo via URL + `JOIN_PIN`
- [ ] Docs: locked-loop linked from README; plan notes supersession
