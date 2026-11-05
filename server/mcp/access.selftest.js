const assert = require("assert");
const town = require("../rules/town");
const { createRoom } = require("../room");
const { startBotPlayer } = require("../players/botPlayer");
const { createRateLimiter } = require("./limits");
const { agentState } = require("./state");

const room = createRoom(town, { joinPin: "4821", maxSeats: 8, agentTransport: "mcp" });

const human = room.join({ name: "Sam", pin: "4821" });
assert.strictEqual(human.access, "browser");
assert.strictEqual(human.host, true);
assert.ok(human.sessionToken);
assert.throws(
  () => room.startGame(human.id),
  (err) => err.code === "NEED_TABLE"
);

const first = room.joinAgent({ name: "Ada" });
assert.strictEqual(first.player.access, "mcp");
assert.strictEqual(first.player.kind, "bot");
assert.strictEqual(first.player.host, false);
assert.strictEqual(first.player.sessionToken, null);
assert.ok(first.token);
assert.notStrictEqual(first.player.id, first.token);

assert.throws(
  () => room.resume(first.token),
  (err) => err.code === "AGENT_CHANNEL"
);
assert.throws(
  () => room.requireMcpPlayer(human.sessionToken),
  (err) => err.code === "AGENT_CHANNEL"
);
assert.throws(
  () => room.requireMcpPlayer(""),
  (err) => err.code === "NO_CREDENTIAL"
);
assert.throws(
  () => room.requireMcpPlayer("not-a-token"),
  (err) => err.code === "BAD_CREDENTIAL"
);
assert.strictEqual(room.requireMcpPlayer(first.token).id, first.player.id);

assert.throws(
  () => room.handleSay(first.player.id, "public", "hello from the back door"),
  (err) => err.code === "AGENT_CHANNEL"
);
assert.throws(
  () => room.handleAct(first.player.id, "ready", {}),
  (err) => err.code === "AGENT_CHANNEL"
);
assert.throws(
  () => startBotPlayer(room, { existingPlayer: first.player }),
  (err) => err.code === "MCP_ONLY"
);

const second = room.joinAgent({ name: "Bea" });
room.startGame(human.id);
assert.strictEqual(room.phase, "talk");
assert.notStrictEqual(first.player.name, "Ada");
assert.strictEqual(first.player.host, false);
assert.strictEqual(second.player.host, false);

const nightPhrase = "shadow-secret-phrase";
room.systemSetPhase("night");
room.withMcpPlayer(first.player.id, () => {
  room.handleSay(first.player.id, "shadow", nightPhrase);
});
const agentView = agentState(room, first.player.id);
const humanView = room.viewFor(human.id);
assert.ok(agentView.channels.shadow.some((message) => message.text === nightPhrase));
assert.ok(agentView.channels.shadow.every((message) => !("fromSeat" in message)));
assert.ok(!JSON.stringify(humanView).includes(nightPhrase));
assert.ok(!JSON.stringify(agentView).includes(second.token));
assert.ok(!JSON.stringify(agentView).includes(human.sessionToken));
assert.ok(agentView.seats.every((seat) => !("kind" in seat)));
assert.strictEqual(agentView.you.kind, "bot");
assert.notStrictEqual(agentView.you.shadowLabel, agentState(room, second.player.id).you.shadowLabel);

assert.throws(
  () => room.withMcpPlayer(human.id, () => room.handleSay(human.id, "public", "nope")),
  (err) => err.code === "AGENT_CHANNEL"
);

const builtin = createRoom(town, { joinPin: "4821", agentTransport: "builtin" });
const pair = builtin.joinPair({ name: "Host", pin: "4821", host: true });
assert.strictEqual(pair.bot.access, "builtin");
const loop = startBotPlayer(builtin, { existingPlayer: pair.bot, intervalMs: 60000 });
loop.stop();
const mcpSeat = builtin.joinAgent({ name: "External" });
assert.throws(
  () => startBotPlayer(builtin, { existingPlayer: mcpSeat.player }),
  (err) => err.code === "MCP_ONLY"
);
assert.throws(
  () => builtin.handleAct(mcpSeat.player.id, "vote", { seatId: pair.human.seatId }),
  (err) => err.code === "AGENT_CHANNEL"
);

builtin.resetRoom(pair.human.id);
assert.throws(
  () => builtin.requireMcpPlayer(mcpSeat.token),
  (err) => err.code === "SESSION_EXPIRED"
);

const limiter = createRateLimiter({ limit: 2, windowMs: 10000 });
assert.strictEqual(limiter.allow("seat"), true);
assert.strictEqual(limiter.allow("seat"), true);
assert.strictEqual(limiter.allow("seat"), false);
assert.strictEqual(limiter.allow("other"), true);

console.log("mcp.access.selftest: ok");
