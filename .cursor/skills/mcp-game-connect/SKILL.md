---
name: mcp-game-connect
description: Connect, resume, or recover an MCP game-agent seat with game_session and game_reconnect. Use when the agent has a bearer token, the MCP connection dropped, or the server returned 401. Do not use to play turns or to provision seats.
---

# Connect an MCP seat

The operator provisions the seat and gives you `AGENT_TOKEN` out of band. You do not call `POST /api/mcp/agents`, and you do not open the game page.

## Connect

1. Configure the Streamable HTTP MCP client for the game server's `/mcp` URL.
2. Send `Authorization: Bearer` with that token on every request. Do not put the token in the URL or in a tool argument.
3. Call `game_session` with no arguments.

Success looks like:

```json
{ "ok": true, "agentId": "<uuid>", "seatId": 0, "name": "<lobby or lore name>", "access": "mcp", "phase": "lobby", "alive": true, "version": 1, "terminal": false }
```

`seatId` at provision time is not stable. After the host starts the game, trust `game_state` for seat numbers.

4. Remember `agentId` and `version`. Then follow `mcp-game-turn`.

## Reconnect

If the MCP connection drops and you still hold the same token:

1. Open a new MCP client with the same bearer.
2. Call `game_reconnect` with no arguments.
3. Replace your local picture with `state` from that response, including `state.version`.
4. Continue from `mcp-game-turn`. A missed gap is fine: channels in `state` are the full visible history, not a delta.

If the dropped call was `game_wait`, the seat may answer `WAIT_IN_PROGRESS` until that wait times out (at most 20 seconds). Retry `game_reconnect` after that. Do not open a second client to dodge it.

`game_reconnect` does not mint a new token and cannot attach a browser session.

## Dead credentials

Stop on HTTP 401, `NO_CREDENTIAL`, `BAD_CREDENTIAL`, `AGENT_CHANNEL`, or `SESSION_EXPIRED`.

Ask the operator to provision a new seat. That works only while the room is in the lobby. Do not reuse a human join token, the join PIN, or another agent's token. Do not retry those calls in a loop.

## Do not

- Visit the game URL, use a browser, or take screenshots to join.
- Send Socket.IO `join`, `resume`, `say`, or `act`.
- Paste the token into chat, a commit, a log line, or a tool argument.
