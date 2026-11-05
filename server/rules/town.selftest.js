const assert = require("assert");
const rules = require("./town");

assert.deepStrictEqual(rules.phases(), [
  "lobby",
  "talk",
  "crisis",
  "vote",
  "night",
  "ended",
]);
assert.strictEqual(rules.initialPhase(), "lobby");
assert.strictEqual(rules.postStartPhase(), "talk");
assert.strictEqual(rules.hideKind(), true);

const host = {
  id: "h1",
  name: "Host",
  seatId: 0,
  kind: "human",
  host: true,
  alive: true,
  tags: [],
  meta: {},
};

const roomLobby = {
  phase: "lobby",
  players: new Map(),
  channels: { public: [] },
  window: null,
  meta: {},
};
const roomTalk = { ...roomLobby, phase: "talk" };

assert.strictEqual(rules.canAdmin(host, "startGame", roomLobby), true);
assert.strictEqual(rules.canAdmin(host, "startGame", roomTalk), false);
assert.strictEqual(rules.canAdmin(host, "addBot", roomLobby), false);
assert.strictEqual(rules.canAdmin(host, "openWindow", roomTalk), true);
assert.strictEqual(rules.canSay(host, "public", roomLobby), false);
assert.strictEqual(rules.canSay(host, "public", roomTalk), true);

const seat = rules.publicSeatFields(host, {
  seatId: 1,
  name: "Ada Colt",
  kind: "bot",
  alive: true,
});
assert.deepStrictEqual(seat, { seatId: 1, name: "Ada Colt", alive: true });
assert.ok(!("kind" in seat));

const prompt = rules.botPrompt(
  { ...host, kind: "bot", name: "Buck", meta: { persona: "A rancher." } },
  { window: null }
);
assert.ok(prompt.includes("bot"));
assert.ok(prompt.includes("never confess") || prompt.includes("Never confess"));
assert.ok(!prompt.includes("seat 0"));

console.log("town.selftest: ok");
