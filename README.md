# Grokbot Hackathon — Wrocław Team 1

Multiagent social deduction (Mafia-shaped) on a game-agnostic kernel: humans and bots are both `Player`s.

## Docs

- [Project plan (Milestone 0+)](docs/grokmafia-plan.md)

## Quick start (Milestone 0)

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000`. For others to join securely:

```bash
ngrok http 3000
```

Share the ngrok URL + `JOIN_PIN` (default `4821`, override with env).
