const assert = require("assert");
const sandbox = require("./rules/sandbox");
const { createRoom } = require("./room");

const room = createRoom(sandbox, { joinPin: "4821", maxSeats: 8 });

const host = room.join({ name: "Host", pin: "4821", host: true });
const guest = room.join({ name: "Guest", pin: "4821" });
assert.strictEqual(host.host, true);
assert.strictEqual(guest.host, false);

room.setPhase(host.id, "talk");

// 1. Non-host cannot openWindow
assert.throws(
  () => room.openWindow(guest.id),
  (err) => err.code === "FORBIDDEN"
);

// Host opens window
room.openWindow(host.id, { maxLen: 160 });
assert.ok(room.window);
assert.strictEqual(room.window.maxLen, 160);

// 2. Two players submit — neither sees the other's draft
room.submit(host.id, "alpha line");
room.submit(guest.id, "beta line");

const hostView = room.viewFor(host.id);
const guestView = room.viewFor(guest.id);
assert.strictEqual(hostView.window.open, true);
assert.strictEqual(hostView.window.submitted, 2);
assert.strictEqual(hostView.window.youSubmitted, true);
assert.strictEqual(hostView.window.yourDraft, "alpha line");
assert.strictEqual(guestView.window.yourDraft, "beta line");
assert.notStrictEqual(hostView.window.yourDraft, guestView.window.yourDraft);
assert.deepStrictEqual(hostView.channels.public, []);
assert.deepStrictEqual(guestView.channels.public, []);

// 4. Second submit from same seat rejected
assert.throws(
  () => room.submit(host.id, "again"),
  (err) => err.code === "ALREADY_SUBMITTED"
);

// 5. handleSay forbidden while window open
assert.throws(
  () => room.handleSay(host.id, "public", "should fail"),
  (err) => err.code === "FORBIDDEN"
);

// 3. closeWindow reveal — both lines in public, stable seat order; window null
room.closeWindow(host.id, { reveal: true });
assert.strictEqual(room.window, null);
assert.strictEqual(room.channels.public.length, 2);
assert.strictEqual(room.channels.public[0].fromSeat, host.seatId);
assert.strictEqual(room.channels.public[0].text, "alpha line");
assert.strictEqual(room.channels.public[1].fromSeat, guest.seatId);
assert.strictEqual(room.channels.public[1].text, "beta line");

// 6. Dead player cannot submit; host setAlive restores
room.openWindow(host.id);
room.setAlive(host.id, guest.seatId, false);
assert.strictEqual(guest.alive, false);
assert.throws(
  () => room.submit(guest.id, "ghost"),
  (err) => err.code === "FORBIDDEN"
);
room.setAlive(host.id, guest.seatId, true);
assert.strictEqual(guest.alive, true);
room.submit(guest.id, "back");
assert.strictEqual(room.viewFor(guest.id).window.yourDraft, "back");
room.closeWindow(host.id, { reveal: false });

// 7. addBot increases seats
const before = room.players.size;
const bot = room.addBot(host.id, { name: "Grok-Test" });
assert.strictEqual(room.players.size, before + 1);
assert.strictEqual(bot.kind, "bot");
assert.strictEqual(bot.name, "Grok-Test");

console.log("room.window.selftest: ok");
