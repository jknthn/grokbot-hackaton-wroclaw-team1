const assert = require("assert");
const rules = require("./sandbox");

assert.deepStrictEqual(rules.phases(), ["lobby", "talk", "done"]);
assert.strictEqual(rules.initialPhase(), "lobby");
assert.deepStrictEqual(rules.actTypes(), ["ready", "submit"]);

const player = {
  id: "p1",
  name: "Ada",
  seatId: 0,
  kind: "human",
  host: true,
  alive: true,
  tags: [],
};

const roomTalk = { phase: "talk", players: {}, channels: { public: [] }, window: null };
const roomLobby = { phase: "lobby", players: {}, channels: { public: [] }, window: null };
const roomWindow = {
  phase: "talk",
  players: {},
  channels: { public: [] },
  window: { id: "w1", maxLen: 160, openedAt: 1, drafts: new Map() },
};

assert.strictEqual(rules.canSay(player, "public", roomTalk), true);
assert.strictEqual(rules.canSay(player, "public", roomLobby), false);
assert.strictEqual(rules.canSay(player, "mafia", roomTalk), false);
assert.strictEqual(rules.canSay(player, "public", roomWindow), false);
assert.strictEqual(rules.canAct(player, "ready", roomLobby), true);
assert.strictEqual(rules.canAct(player, "submit", roomWindow), true);
assert.strictEqual(rules.canAct(player, "submit", roomTalk), false);
assert.deepStrictEqual(rules.visibleChannels(player, roomTalk), ["public"]);
assert.strictEqual(rules.onAct(roomTalk, player, "ready", {}).ok, true);
assert.strictEqual(rules.canAdmin(player, "openWindow", roomTalk), true);
assert.strictEqual(rules.canAdmin(player, "resetGame", roomTalk), true);
assert.strictEqual(rules.canAdmin(player, "resetRoom", roomTalk), true);
rules.onReset(roomTalk);
assert.ok(Array.isArray(roomTalk.channels.public));

const dead = { ...player, alive: false };
assert.strictEqual(rules.canSay(dead, "public", roomTalk), false);
assert.strictEqual(rules.canAct(dead, "submit", roomWindow), false);

const promptOpen = rules.botPrompt(player, { window: { open: true } });
assert.ok(promptOpen.includes("blind"));

console.log("sandbox.selftest: ok");
