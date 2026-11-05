const assert = require("assert");
const sandbox = require("./rules/sandbox");
const { createRoom } = require("./room");

const room = createRoom(sandbox, { joinPin: "4821", maxSeats: 8 });

const host = room.join({ name: "Host", pin: "4821", host: true });
const guest = room.join({ name: "Guest", pin: "4821" });
const bot = room.addBot(host.id, { name: "Grok-R" });

assert.strictEqual(host.host, true);
assert.strictEqual(guest.host, false);

// Dirty the round
room.setPhase(host.id, "talk");
room.handleSay(host.id, "public", "hello table");
room.openWindow(host.id, { maxLen: 120 });
room.submit(guest.id, "draft line");
room.setAlive(host.id, guest.seatId, false);
guest.tags = ["scratch"];
guest.meta = { strike: 0 };
bot.meta = { strike: 1 };

assert.strictEqual(room.phase, "talk");
assert.ok(room.window);
assert.strictEqual(room.channels.public.length, 1);
assert.strictEqual(guest.alive, false);

// Non-host cannot reset
assert.throws(
  () => room.resetGame(guest.id),
  (err) => err.code === "FORBIDDEN"
);

const seatIdsBefore = [...room.players.values()].map((p) => p.seatId).sort();
const namesBefore = [...room.players.values()].map((p) => p.name).sort();
const sizeBefore = room.players.size;

room.resetGame(host.id);

assert.strictEqual(room.phase, "lobby");
assert.strictEqual(room.window, null);
assert.deepStrictEqual(room.channels.public, []);
assert.strictEqual(room.players.size, sizeBefore);
assert.deepStrictEqual(
  [...room.players.values()].map((p) => p.seatId).sort(),
  seatIdsBefore
);
assert.deepStrictEqual(
  [...room.players.values()].map((p) => p.name).sort(),
  namesBefore
);
assert.strictEqual(host.host, true);
assert.strictEqual(guest.host, false);
assert.strictEqual(guest.alive, true);
assert.strictEqual(bot.alive, true);
assert.deepStrictEqual(guest.tags, []);
assert.strictEqual(guest.meta.lobbyName, "Guest");
assert.strictEqual(guest.name, "Guest");
assert.ok(!guest.meta.strike);
assert.ok(!bot.meta.strike);
assert.strictEqual(bot.meta.lobbyName, "Grok-R");
assert.strictEqual(bot.name, "Grok-R");

const hostView = room.viewFor(host.id);
assert.ok(hostView.allowed.admin.includes("resetGame"));
assert.ok(hostView.allowed.admin.includes("resetRoom"));
assert.strictEqual(hostView.window, null);
assert.deepStrictEqual(hostView.channels.public, []);
assert.ok(host.sessionToken);
assert.strictEqual(room.resume(host.sessionToken).id, host.id);

console.log("room.reset.selftest: ok");
