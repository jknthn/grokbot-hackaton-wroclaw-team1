const assert = require("assert");
const sandbox = require("./rules/sandbox");
const { createRoom } = require("./room");

const room = createRoom(sandbox, { joinPin: "4821", maxSeats: 8 });

const host = room.join({ name: "Host", pin: "4821", host: true });
const guest = room.join({ name: "Guest", pin: "4821" });

assert.ok(host.sessionToken);
assert.ok(guest.sessionToken);
assert.notStrictEqual(host.sessionToken, guest.sessionToken);

// resume returns same seat / host flag
const resumed = room.resume(guest.sessionToken);
assert.strictEqual(resumed.id, guest.id);
assert.strictEqual(resumed.seatId, guest.seatId);
assert.strictEqual(resumed.name, "Guest");
assert.strictEqual(resumed.host, false);

assert.throws(
  () => room.resume("nope"),
  (err) => err.code === "NO_SESSION"
);

// resetGame keeps sessions
room.setPhase(host.id, "talk");
room.setAlive(host.id, guest.seatId, false);
room.resetGame(host.id);
assert.strictEqual(room.resume(guest.sessionToken).id, guest.id);
assert.strictEqual(guest.alive, true);

// non-host cannot clear table
assert.throws(
  () => room.resetRoom(guest.id),
  (err) => err.code === "FORBIDDEN"
);

const guestToken = guest.sessionToken;
const hostToken = host.sessionToken;
room.resetRoom(host.id);

assert.strictEqual(room.players.size, 0);
assert.strictEqual(room.phase, "lobby");
assert.strictEqual(room.window, null);
assert.deepStrictEqual(room.channels.public, []);
assert.throws(
  () => room.resume(guestToken),
  (err) => err.code === "NO_SESSION"
);
assert.throws(
  () => room.resume(hostToken),
  (err) => err.code === "NO_SESSION"
);

// fresh join after clear works; seat ids restart
const again = room.join({ name: "Host2", pin: "4821" });
assert.strictEqual(again.seatId, 0);
assert.strictEqual(again.host, true);
assert.ok(again.sessionToken);

const hostView = room.viewFor(again.id);
assert.ok(hostView.allowed.admin.includes("resetRoom"));
assert.ok(hostView.allowed.admin.includes("resetGame"));

console.log("room.session.selftest: ok");
