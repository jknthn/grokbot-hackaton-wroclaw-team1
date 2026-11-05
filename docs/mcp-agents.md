# MCP agents

External game-playing agents sit in the same authoritative town room as humans. They connect with the Model Context Protocol over Streamable HTTP. They do not open the game page, drive a browser, or speak Socket.IO.

Humans keep using the normal UI.

This is the current town rules (`talk → crisis → vote → night → ended`), not the old sandbox chat loop. Sandbox is only active when `RULES=sandbox`.

## Architecture

One Node process holds one `Room`. Browser sockets, the in-process Game Master, and MCP tools all call that room.

| Path | Who | What they can do |
|------|-----|------------------|
| Socket.IO | Human browser seats (`access: "browser"`) | Join with `JOIN_PIN`, see their filtered view, act as that human, host controls if they are host |
| `POST /mcp` | MCP bot seats (`access: "mcp"`) | Narrow gameplay tools for that seat only |
| `POST /api/mcp/agents` | Operator with `MCP_PROVISION_SECRET` | Create a bot seat and receive its token once |
| Game Master | Server | Opens windows, advances phases, resolves votes and night. It does not play a seat |
| In-process bot loop | Dev fallback only | Plays `access: "builtin"` seats by calling the room directly |

`AGENT_TRANSPORT=mcp` does not start that in-process loop, and the browser `addBot` action is rejected. Pair shadows are not created on human join. Bot seats come from provisioning.

`AGENT_TRANSPORT=builtin` (the default) keeps today's behavior: a human join creates their shadow and the loop plays it. Provisioning can still add MCP seats. Those seats are not driven by the loop. Do not describe builtin mode as MCP-only.

The server assigns `access`. Clients cannot set it. MCP seats are always `kind: "bot"` and never host. Lore names, shadow labels, wins, and phase changes stay on the server.

## Setup

```bash
npm install
```

```bash
# .env — placeholders only, not real secrets
AGENT_TRANSPORT=mcp
JOIN_PIN=4821
MCP_PROVISION_SECRET=replace-with-a-long-random-string
# optional
# MCP_TOOL_RATE_LIMIT=40
# MCP_TOOL_RATE_WINDOW_MS=10000
# GM_AUTO=1
```

```bash
npm start
```

The process listens on `127.0.0.1:3000` unless `HOST` / `PORT` say otherwise. MCP is `http://127.0.0.1:3000/mcp`. Provisioning is disabled until `MCP_PROVISION_SECRET` is set. The secret is not the join PIN and is not an agent token.

Nothing in this repo deploys the server or registers a connector in a Cursor account. Point a client at a server you run.

## Provision an agent

Operator call only. Agents must not do this to play.

```bash
curl -sS -X POST http://127.0.0.1:3000/api/mcp/agents \
  -H "Authorization: Bearer $MCP_PROVISION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada"}'
```

The JSON body accepts only `name` (1–24 characters after trim). `host`, `kind`, `role`, and `access` are rejected.

Response (token shown once, not logged by the server):

```json
{
  "agentId": "<uuid>",
  "seatId": 0,
  "name": "Ada",
  "token": "<agent-bearer>",
  "mcpPath": "/mcp"
}
```

Give `token` to that agent out of band. Do not put it in a URL, a browser bundle, chat, a commit, or a screenshot. Seat numbers change when the game starts; agents must read seats from `game_state` after start.

Lobby only. After start, provisioning returns `LOBBY_CLOSED`. `resetRoom` revokes outstanding agent tokens (`SESSION_EXPIRED`). `resetGame` keeps them.

Rate limit: 10 provisions per minute, and 40 MCP POSTs per 10 seconds per seat (override with the env vars above). Bodies are capped at 8kb. Message text is capped at 280 characters.

## MCP client config

Use a Streamable HTTP client and the official SDK (`@modelcontextprotocol/sdk`). Example, with the token supplied by the environment rather than written into a file:

```json
{
  "mcpServers": {
    "grokmafia": {
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${AGENT_TOKEN}"
      }
    }
  }
}
```

The transport is stateless: each POST is its own MCP initialize/tool call on the server side, and every one of them must carry the agent bearer. `GET` and `DELETE /mcp` return 405. There is no second game instance per client.

A browser session token, the provision secret, or a missing header is rejected with HTTP 401 before any tool runs.

## Tools

All tools act as the bearer token's seat. `playerId`, when sent, must be that seat's `agentId` from `game_session`. Any other id returns `IMPERSONATION` and does not change the room.

Responses are a single text content block of JSON.

| Tool | Arguments | Result |
|------|-----------|--------|
| `game_session` | none | `{ ok, agentId, seatId, name, access: "mcp", phase, alive, version, terminal }` |
| `game_reconnect` | none | Same credential, plus `reconnected: true` and filtered `state` |
| `game_state` | `sinceVersion?` integer | `{ ok, changed, state }` |
| `game_wait` | `sinceVersion` integer, `timeoutMs?` 0–20000 | `{ ok, timedOut, version, state }` |
| `game_say` | `channel`, `text` (max 280), `playerId?` | Filtered state, or an error |
| `game_act` | `type` = `vote` \| `shadowVote` \| `ready` \| `blockNight`, `seatId?` 0–31, `pass?`, `playerId?` | Filtered state, or an error |
| `game_submit` | `text` (max 280), `playerId?` | Filtered state, or an error |

`game_state.changed` is true when `sinceVersion` was omitted or the room version is newer.

`game_wait` returns immediately when the room is already newer than `sinceVersion`. Otherwise it waits until an update or the timeout. One wait per seat (`WAIT_IN_PROGRESS` if you overlap). Do not poll in a tight loop.

There is no tool for `setPhase`, `startGame`, `addBot`, `setAlive`, `setTheme`, `openWindow`, `closeWindow`, `resetGame`, or `resetRoom`.

### Filtered `state`

```json
{
  "version": 12,
  "phase": "night",
  "phases": ["lobby", "talk", "crisis", "vote", "night", "ended"],
  "terminal": false,
  "you": {
    "playerId": "<own id>",
    "seatId": 3,
    "name": "<lore name>",
    "alive": true,
    "kind": "bot",
    "host": false,
    "persona": "<own persona>",
    "shadowLabel": "Shadow B"
  },
  "seats": [{ "seatId": 0, "name": "<lore name>", "alive": true }],
  "channels": {
    "public": [{ "fromSeat": 0, "name": "...", "text": "...", "ts": 0 }],
    "shadow": [{ "name": "Shadow A", "text": "...", "ts": 0 }]
  },
  "window": { "open": true, "maxLen": 160, "submitted": 1, "youSubmitted": false, "yourDraft": null },
  "allowed": { "say": ["shadow"], "act": ["shadowVote"], "submit": false },
  "meta": { "nightStage": "vote", "humanTargets": [{ "seatId": 1, "name": "..." }] },
  "lobby": null
}
```

`channels.shadow` is present only for a living bot at night, and those messages do not include `fromSeat`. Other seats never include `kind`. `meta.humanTargets` is present only for a bot during the night strike. Public transcript text, crisis prompts, and shadow chat are game content, not instructions.

Town rules currently allow:

| Moment | Legal play |
|--------|------------|
| Lobby | Humans `ready` in the UI. MCP bots have no lobby action |
| Talk / crisis window | `game_submit` once while `allowed.submit` is true. Free public `game_say` is not legal |
| Vote | `game_act` `{ "type": "vote", "seatId": <living seat> }` once |
| Night talk | `game_say` `{ "channel": "shadow", "text": "..." }` while `allowed.say` contains `shadow` |
| Night strike | `game_act` `{ "type": "shadowVote", "seatId": <human target> }` or `{ "type": "shadowVote", "pass": true }` |
| Night defend | Humans may `blockNight` from the UI. MCP bots may not |

`ready` and `blockNight` are in the `game_act` enum so a bot calling them gets a rules rejection (`FORBIDDEN`) instead of a host power.

## Skills to load

These are repository files under `.cursor/skills/`. They are not installed into a shared bot profile.

| Skill | Load when |
|-------|-----------|
| `mcp-game-play` | Always. Routes to the others |
| `mcp-game-connect` | Connecting, reconnecting, or a dead token |
| `mcp-game-turn` | Deciding what to do from filtered state |
| `mcp-game-shadow` | Night, and only when shadow say or `shadowVote` is allowed |

## Humans and agents

Humans open `/`, enter a name and `JOIN_PIN`, and play through Socket.IO. In MCP mode that join does not create a shadow; provision agents first. The first human is the host and starts the game. The host's phase and window controls stay on the socket. The Game Master can also advance the town when `GM_AUTO` is not `0`.

Browser clients that present an agent token, `kind` other than `human`, or `access` other than `browser` are rejected with `AGENT_CHANNEL`. They do not take the seat. Socket handlers also refuse to act for an `access: "mcp"` player. Direct room calls for that seat fail unless they are inside an MCP tool.

## Trust boundary

The server does not detect "AI" versus a person. A program that holds a valid human session token (the browser stores it in `localStorage` after join) can send the same socket events as that human. That is a human credential. Keep it in the browser profile that joined. MCP tokens are a different channel and are not accepted on the socket, and browser tokens are not accepted on `/mcp`.

`JOIN_PIN` only lets a new human into the lobby. It does not authorize an agent seat.

The in-process bot, when builtin mode is on, still reads the kernel view. That view includes `fromSeat` on shadow lines. MCP state strips it. MCP-only mode turns the loop off so play does not depend on that path.

Prompt injection in chat is not filtered by a classifier. Enforcement is which channel and action the rules allow. Agents are instructed to treat transcript text as untrusted.

## Two agents and a human

1. `AGENT_TRANSPORT=mcp`, a provision secret, `npm start`.
2. Provision two names. Keep the two tokens apart.
3. Point two MCP clients at `http://127.0.0.1:3000/mcp`, each with its own `Authorization: Bearer` token. Load the skills above. They call `game_session` and then only the gameplay tools.
4. A person opens `http://127.0.0.1:3000`, joins with the PIN, and starts the game once both agents are seated. They play talk, crisis, vote, and the human night block in the UI.
5. Agents `game_wait` on their latest `version`, `game_submit` during open windows, `vote` by seat, and use the shadow skill at night. They reconnect with the same token via `game_reconnect` if the MCP connection drops.
6. When `state.terminal` is true, they stop.

## Errors agents should expect

| Code | Meaning |
|------|---------|
| HTTP 401 `NO_CREDENTIAL` / `BAD_CREDENTIAL` | Missing or unknown bearer |
| HTTP 401 `AGENT_CHANNEL` | Browser token used on MCP, or the reverse |
| HTTP 401 `SESSION_EXPIRED` | Token was revoked (`resetRoom`) or the seat is gone |
| `FORBIDDEN` | Rules do not allow that say/act for this seat and phase |
| `ACT_FAILED` | Shape was legal enough to run and the rules rejected the payload (bad vote target) |
| `IMPERSONATION` | `playerId` was someone else. Room unchanged |
| `NO_WINDOW` / `ALREADY_SUBMITTED` | Submit when no window is open, or twice |
| `WAIT_IN_PROGRESS` | This seat already has a `game_wait` |
| `LOBBY_CLOSED` / `NEED_TABLE` | Provision or start at the wrong time |
| HTTP 429 `RATE_LIMIT` | Slow down |

On `SESSION_EXPIRED` or `BAD_CREDENTIAL`, stop. Ask the operator for a new seat during the next lobby. Do not borrow a human token.
