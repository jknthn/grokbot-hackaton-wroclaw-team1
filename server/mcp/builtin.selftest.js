const assert = require("assert");
const { io } = require("socket.io-client");
const { createGameServer } = require("../index");

async function ack(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res));
  });
}

async function main() {
  const game = createGameServer({
    PORT: "0",
    HOST: "127.0.0.1",
    JOIN_PIN: "4821",
    AGENT_TRANSPORT: "builtin",
    GM_AUTO: "0",
    RULES: "town",
    MCP_PROVISION_SECRET: "test-provision-secret",
  });
  const address = await game.listen();
  const base = `http://127.0.0.1:${address.port}`;
  const socket = io(base, { transports: ["websocket"] });
  try {
    await new Promise((resolve, reject) => {
      socket.on("connect", resolve);
      socket.on("connect_error", reject);
    });
    const joined = await ack(socket, "join", { name: "Nia", pin: "4821" });
    assert.strictEqual(joined.ok, true);
    assert.strictEqual(game.room.players.size, 2);
    const human = game.room.players.get(joined.playerId);
    const bot = [...game.room.players.values()].find((player) => player.id !== human.id);
    assert.strictEqual(human.access, "browser");
    assert.strictEqual(human.kind, "human");
    assert.strictEqual(bot.kind, "bot");
    assert.strictEqual(bot.access, "builtin");
    assert.notStrictEqual(bot.access, "mcp");

    const provision = await fetch(base + "/api/mcp/agents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-provision-secret",
      },
      body: JSON.stringify({ name: "External" }),
    });
    assert.strictEqual(provision.status, 201);
    const created = await provision.json();
    const agent = game.room.players.get(created.agentId);
    assert.strictEqual(agent.access, "mcp");
    assert.throws(
      () => game.room.handleSay(agent.id, "public", "direct"),
      (err) => err.code === "AGENT_CHANNEL"
    );
    const browserReuse = await ack(socket, "resume", { token: created.token });
    assert.strictEqual(browserReuse.ok, false);
    assert.strictEqual(browserReuse.error, "AGENT_CHANNEL");
    assert.strictEqual(game.room.players.get(joined.playerId).id, human.id);
  } finally {
    socket.close();
    await game.close();
  }
  console.log("mcp.builtin.selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
