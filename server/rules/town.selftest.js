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
const roomVote = { ...roomLobby, phase: "vote", meta: { votes: new Map() } };

assert.strictEqual(rules.canAdmin(host, "startGame", roomLobby), true);
assert.strictEqual(rules.canAdmin(host, "setTheme", roomLobby), true);
assert.strictEqual(rules.canAdmin(host, "startGame", roomTalk), false);
assert.strictEqual(rules.canAdmin(host, "addBot", roomLobby), true);
assert.strictEqual(rules.canAdmin(host, "openWindow", roomTalk), true);
assert.strictEqual(rules.canAdmin(host, "openWindow", roomCrisis), true);
assert.strictEqual(rules.canAdmin(host, "openWindow", roomLobby), false);
assert.strictEqual(rules.canAdmin(host, "setAlive", roomVote), false);
assert.strictEqual(rules.canSay(host, "public", roomTalk), false);
assert.strictEqual(rules.canAct(host, "ready", roomLobby), true);
assert.strictEqual(rules.canAct(host, "vote", roomVote), true);
assert.strictEqual(rules.canAct(host, "submit", { ...roomCrisis, window: {} }), true);

const themes = rules.themes();
assert.ok(themes.length >= 4);

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
assert.ok(prompt.includes("Never confess") || prompt.includes("never confess"));

(async () => {
  const room = {
    phase: "crisis",
    players: new Map([["h1", { ...host }]]),
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

  const voteRoom = {
    phase: "vote",
    players: new Map([
      ["h1", { id: "h1", name: "Ada", seatId: 0, kind: "human", alive: true, meta: {} }],
      ["b1", { id: "b1", name: "Buck", seatId: 1, kind: "bot", alive: true, meta: {} }],
      ["b2", { id: "b2", name: "Cal", seatId: 2, kind: "bot", alive: true, meta: {} }],
    ]),
    channels: { public: [] },
    meta: { votes: new Map() },
  };
  rules.onAct(voteRoom, voteRoom.players.get("h1"), "vote", { seatId: 1 });
  rules.onAct(voteRoom, voteRoom.players.get("b1"), "vote", { seatId: 1 });
  rules.onAct(voteRoom, voteRoom.players.get("b2"), "vote", { seatId: 1 });
  const resolved = rules.resolveVotes(voteRoom);
  assert.ok(resolved.removed);
  assert.strictEqual(resolved.removed.name, "Buck");
  assert.ok(voteRoom.channels.public.some((m) => /voted out/i.test(m.text)));
  assert.ok(!voteRoom.channels.public.some((m) => /bot|human/i.test(m.text) && /voted out/i.test(m.text)));

  console.log("town.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
