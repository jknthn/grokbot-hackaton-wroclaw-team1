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
const roomCrisis = { ...roomLobby, phase: "crisis" };

assert.strictEqual(rules.canAdmin(host, "startGame", roomLobby), true);
assert.strictEqual(rules.canAdmin(host, "setTheme", roomLobby), true);
assert.strictEqual(rules.canAdmin(host, "startGame", roomTalk), false);
assert.strictEqual(rules.canAdmin(host, "setTheme", roomTalk), false);
assert.strictEqual(rules.canAdmin(host, "addBot", roomLobby), true);
assert.strictEqual(rules.canAdmin(host, "addBot", roomTalk), false);
assert.strictEqual(rules.canAdmin(host, "openWindow", roomTalk), true);
assert.strictEqual(rules.canAdmin(host, "openWindow", roomCrisis), true);
assert.strictEqual(rules.canAdmin(host, "openWindow", roomLobby), false);
assert.strictEqual(rules.canSay(host, "public", roomLobby), false);
assert.strictEqual(rules.canSay(host, "public", roomTalk), true);
assert.strictEqual(rules.canAct(host, "submit", { ...roomCrisis, window: {} }), true);

const themes = rules.themes();
assert.ok(themes.length >= 4);
assert.ok(themes.every((t) => t.id && t.label));

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

const crisisPrompt = rules.botPrompt(
  { ...host, kind: "bot", name: "Buck", meta: { persona: "A rancher." } },
  {
    phase: "crisis",
    window: { open: true },
    meta: { crisisPrompt: "The well is failing." },
  }
);
assert.ok(crisisPrompt.includes("well") || crisisPrompt.includes("Crisis"));

(async () => {
  const room = {
    phase: "crisis",
    players: new Map([["h1", host]]),
    channels: { public: [] },
    meta: { cityPoints: 0, crisisPrompt: "The well is failing." },
  };
  await rules.onCloseWindow(room, [
    {
      name: "Ada",
      text: "Shore the well with timber and post two guards tonight.",
    },
  ]);
  assert.ok(room.meta.cityPoints >= 1);
  assert.ok(room.channels.public.some((m) => /City points/i.test(m.text)));

  console.log("town.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
