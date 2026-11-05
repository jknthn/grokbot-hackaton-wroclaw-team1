const assert = require("assert");
const town = require("./rules/town");
const { createRoom } = require("./room");

// --- Underdog / 1-human: quiet night must NOT end the game on parity ---
{
  const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
  const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
  room.addBot(human.id, { name: "Extra" });
  room.addBot(human.id, { name: "Extra2" });
  room.handleAct(human.id, "ready", {});
  assert.ok(room.tryAutoStart("wildWest").ok);
  assert.strictEqual(room.meta.winMode, "survival");

  room.systemSetPhase("night");
  room.setNightStage("vote");
  // No shadow votes → quiet night
  room.tallyShadowVotes();
  const quiet = room.resolveNight();
  assert.strictEqual(quiet.killed, null);
  assert.strictEqual(quiet.winner, null);
  assert.notStrictEqual(room.phase, "ended");
  assert.strictEqual(room.meta.nightsSurvived, 1);
  assert.ok(human.alive);
}

// --- Survival: N quiet nights → humans win ---
{
  const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
  const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
  room.addBot(human.id, { name: "Extra" });
  room.handleAct(human.id, "ready", {});
  assert.ok(room.tryAutoStart("wildWest").ok);
  room.meta.surviveNights = 2;

  for (let i = 0; i < 2; i++) {
    room.systemSetPhase("night");
    room.setNightStage("vote");
    room.tallyShadowVotes();
    const r = room.resolveNight();
    if (i < 1) {
      assert.strictEqual(r.winner, null);
      assert.notStrictEqual(room.phase, "ended");
      room.systemSetPhase("talk");
    } else {
      assert.strictEqual(r.winner, "humans");
      assert.strictEqual(room.phase, "ended");
      assert.ok(/night/i.test(room.meta.winReason || ""));
    }
  }
}

// --- Survival: city points goal → humans win ---
{
  const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
  const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
  room.addBot(human.id, { name: "Extra" });
  room.handleAct(human.id, "ready", {});
  assert.ok(room.tryAutoStart("wildWest").ok);
  assert.strictEqual(room.meta.winMode, "survival");
  room.meta.cityPointGoal = 2;
  room.meta.cityPoints = 2;
  assert.strictEqual(town.checkWin(room), "humans");
  assert.ok(/points|goal/i.test(town.explainWin(room, "humans")));
}

// --- Survival: last human dies → bots win ---
{
  const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
  const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
  room.addBot(human.id, { name: "Extra" });
  room.handleAct(human.id, "ready", {});
  assert.ok(room.tryAutoStart("wildWest").ok);

  room.systemSetPhase("night");
  const bots = [...room.players.values()].filter((p) => p.kind === "bot" && p.alive);
  room.setNightStage("vote");
  for (const b of bots) {
    room.handleAct(b.id, "shadowVote", { seatId: human.seatId });
  }
  room.tallyShadowVotes();
  room.meta.cityPoints = 0;
  const kill = room.resolveNight();
  assert.ok(kill.killed);
  assert.strictEqual(human.alive, false);
  assert.strictEqual(kill.winner, "bots");
  assert.strictEqual(room.phase, "ended");
}

// --- Parity mode: humans ≤ bots ends for bots ---
{
  const players = new Map([
    ["h1", { id: "h1", name: "Ada", seatId: 0, kind: "human", alive: true, meta: {} }],
    ["h2", { id: "h2", name: "Bea", seatId: 1, kind: "human", alive: true, meta: {} }],
    ["b1", { id: "b1", name: "Cal", seatId: 2, kind: "bot", alive: true, meta: {} }],
  ]);
  const room = {
    phase: "vote",
    players,
    channels: { public: [] },
    meta: { votes: new Map(), winMode: "parity" },
  };
  // Vote out one human → 1H 1B → parity bot win
  town.onAct(room, players.get("h1"), "vote", { seatId: 1 });
  town.onAct(room, players.get("h2"), "vote", { seatId: 1 });
  town.onAct(room, players.get("b1"), "vote", { seatId: 1 });
  const resolved = town.resolveVotes(room);
  assert.ok(resolved.removed);
  assert.strictEqual(resolved.winner, "bots");
}

// --- Parity: wipe bots → humans ---
{
  const room = {
    phase: "vote",
    players: new Map([
      ["h1", { id: "h1", name: "Ada", seatId: 0, kind: "human", alive: true, meta: {} }],
      ["h2", { id: "h2", name: "Bea", seatId: 1, kind: "human", alive: true, meta: {} }],
      ["b1", { id: "b1", name: "Cal", seatId: 2, kind: "bot", alive: true, meta: {} }],
    ]),
    channels: { public: [] },
    meta: { votes: new Map(), winMode: "parity" },
  };
  town.onAct(room, room.players.get("h1"), "vote", { seatId: 2 });
  town.onAct(room, room.players.get("h2"), "vote", { seatId: 2 });
  town.onAct(room, room.players.get("b1"), "vote", { seatId: 2 });
  const resolved = town.resolveVotes(room);
  assert.strictEqual(resolved.winner, "humans");
}

console.log("room.win.selftest: ok");
