const assert = require("assert");
const rules = require("./sandbox");

assert.deepStrictEqual(rules.phases(), ["lobby", "talk", "done"]);
assert.strictEqual(rules.initialPhase(), "lobby");

const player = {
  id: "p1",
  name: "Ada",
  seatId: 0,
  kind: "human",
  host: true,
  alive: true,
  tags: [],
};

const roomTalk = { phase: "talk", players: {}, channels: { public: [] } };
const roomLobby = { phase: "lobby", players: {}, channels: { public: [] } };

assert.strictEqual(rules.canSay(player, "public", roomTalk), true);
assert.strictEqual(rules.canSay(player, "public", roomLobby), false);
assert.strictEqual(rules.canSay(player, "mafia", roomTalk), false);
assert.strictEqual(rules.canAct(player, "ready", roomLobby), true);
assert.deepStrictEqual(rules.visibleChannels(player, roomTalk), ["public"]);
assert.strictEqual(rules.onAct(roomTalk, player, "ready", {}).ok, true);

console.log("sandbox.selftest: ok");
