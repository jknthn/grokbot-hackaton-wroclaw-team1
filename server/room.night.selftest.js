const assert = require("assert");
const town = require("./rules/town");
const { createRoom } = require("./room");

const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
room.addBot(human.id, { name: "Extra" });
room.addBot(human.id, { name: "Extra2" });
room.handleAct(human.id, "ready", {});
assert.ok(room.tryAutoStart("wildWest").ok);

const humanView = room.viewFor(human.id);
assert.strictEqual(humanView.you.kind, "human");
assert.ok(humanView.seats.every((s) => !("kind" in s)));

room.meta.cityPoints = 2;
room.systemSetPhase("night");
assert.strictEqual(room.phase, "night");
assert.strictEqual(room.meta.night.stage, "talk");

const bots = [...room.players.values()].filter((p) => p.kind === "bot" && p.alive);
assert.ok(bots.length >= 2);
assert.ok(bots.every((b) => b.meta.shadowLabel && /^Shadow [A-Z]$/.test(b.meta.shadowLabel)));
const labels = new Set(bots.map((b) => b.meta.shadowLabel));
assert.strictEqual(labels.size, bots.length);

const botView = room.viewFor(bots[0].id);
assert.ok(botView.allowed.say.includes("shadow"));
assert.ok(botView.channels.shadow);
assert.ok(!room.viewFor(human.id).channels.shadow);
assert.ok(!room.viewFor(human.id).allowed.say.includes("shadow"));

room.handleSay(bots[0].id, "shadow", "Strike the loud one.");
assert.ok(room.channels.shadow.some((m) => /^Shadow /.test(m.name)));

room.setNightStage("vote");
assert.strictEqual(room.meta.night.stage, "vote");
const voteView = room.viewFor(bots[0].id);
assert.ok(voteView.meta.humanTargets.length >= 1);
assert.ok(voteView.allowed.act.includes("shadowVote"));

const humanSeat = human.seatId;

// 1-human: 2/3 supermajority — with 3 shadows, need 2 (one PASS no longer vetoes)
assert.ok(bots.length >= 3);
room.handleAct(bots[0].id, "shadowVote", { seatId: humanSeat });
room.handleAct(bots[1].id, "shadowVote", { seatId: humanSeat });
room.handleAct(bots[2].id, "shadowVote", { pass: true });
let tallied = room.tallyShadowVotes();
assert.strictEqual(tallied.need, Math.ceil((bots.length * 2) / 3));
assert.strictEqual(tallied.target, humanSeat);
assert.ok(tallied.supermajority);

// Split below 2/3 → quiet (only 1 of 3 strikes)
room.setNightStage("vote");
room.handleAct(bots[0].id, "shadowVote", { seatId: humanSeat });
room.handleAct(bots[1].id, "shadowVote", { pass: true });
room.handleAct(bots[2].id, "shadowVote", { pass: true });
tallied = room.tallyShadowVotes();
assert.strictEqual(tallied.target, null);

// Full pile-on still works
room.setNightStage("vote");
for (const b of bots) {
  room.handleAct(b.id, "shadowVote", { seatId: humanSeat });
}
tallied = room.tallyShadowVotes();
assert.strictEqual(tallied.target, humanSeat);

room.setNightStage("defend");
assert.ok(room.viewFor(human.id).meta.canBlockNight);
room.handleAct(human.id, "blockNight", {});
assert.strictEqual(room.meta.cityPoints, 1);
assert.ok(room.meta.night.blocked);

const resolved = room.resolveNight();
assert.strictEqual(resolved.killed, null);
assert.ok(resolved.blocked);
assert.ok(human.alive);
assert.strictEqual(resolved.winner, null);
assert.notStrictEqual(room.phase, "ended");
assert.ok(room.channels.public.some((m) => /Quiet night/i.test(m.text)));

// Second night: kill without block
room.systemSetPhase("talk");
room.systemSetPhase("night");
const bots2 = [...room.players.values()].filter((p) => p.kind === "bot" && p.alive);
room.setNightStage("vote");
for (const b of bots2) {
  room.handleAct(b.id, "shadowVote", { seatId: human.seatId });
}
room.tallyShadowVotes();
room.meta.cityPoints = 0;
const kill = room.resolveNight();
assert.ok(kill.killed);
assert.strictEqual(human.alive, false);
assert.strictEqual(kill.winner, "bots");
assert.strictEqual(room.phase, "ended");
assert.ok(room.channels.public.some((m) => /vanished/i.test(m.text)));

console.log("room.night.selftest: ok");
