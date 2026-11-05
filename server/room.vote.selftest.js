const assert = require("assert");
const town = require("./rules/town");
const { createRoom } = require("./room");

const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
room.addBot(human.id, { name: "Extra" });
room.handleAct(human.id, "ready", {});
assert.ok(room.tryAutoStart("wildWest").ok);

room.systemSetPhase("vote");
const living = [...room.players.values()].filter((p) => p.alive);
assert.ok(living.length >= 3);

const target = living.find((p) => p.id !== human.id);
const view = room.viewFor(human.id);
assert.ok(view.allowed.act.includes("vote"));
assert.ok(!(view.allowed.admin || []).includes("setAlive"));

for (const p of living) {
  room.handleAct(p.id, "vote", { seatId: target.seatId });
}

const beforeAlive = target.alive;
const result = room.resolveVote();
assert.strictEqual(beforeAlive, true);
assert.ok(result.removed);
assert.strictEqual(result.removed.seatId, target.seatId);
assert.strictEqual(target.alive, false);
assert.ok(room.channels.public.some((m) => /voted out/i.test(m.text)));
const voteLine = room.channels.public
  .filter((m) => /voted out/i.test(m.text))
  .map((m) => m.text)
  .join(" ");
assert.ok(!/is a bot|is human|bot vs human|reveals? (bot|human)/i.test(voteLine));

// Plurality: a single leading ballot is enough (no absolute majority required)
room.systemSetPhase("talk");
room.systemSetPhase("vote");
const living2 = [...room.players.values()].filter((p) => p.alive);
assert.ok(living2.length >= 2);
const victim = living2.find((p) => p.id !== human.id) || living2[1];
room.handleAct(living2[0].id, "vote", { seatId: victim.seatId });
// Others abstain — plurality of 1 still removes
const r2 = room.resolveVote();
assert.ok(r2.removed);
assert.strictEqual(r2.removed.seatId, victim.seatId);
assert.strictEqual(victim.alive, false);

// No ballots → nobody removed
room.systemSetPhase("talk");
room.systemSetPhase("vote");
const r3 = room.resolveVote();
assert.strictEqual(r3.removed, null);

console.log("room.vote.selftest: ok");
