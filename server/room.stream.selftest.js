const assert = require("assert");
const town = require("./rules/town");
const { createRoom } = require("./room");
const { getStreamView } = require("./views");

const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
const { human, bot } = room.joinPair({ name: "Alex", pin: "4821", host: true });

let stream = room.streamView();
assert.strictEqual(stream.mode, "stream");
assert.strictEqual(stream.phase, "lobby");
assert.strictEqual(stream.seats.length, 2);
assert.ok(stream.seats.every((s) => !("kind" in s)));
assert.ok(!stream.channels.shadow);
assert.deepStrictEqual(Object.keys(stream.channels), ["public"]);

room.startGame(human.id);
stream = room.streamView();
assert.strictEqual(stream.phase, "talk");
assert.ok(stream.meta);
assert.ok(!("shadowLabel" in stream.meta));
assert.ok(!("canBlockNight" in stream.meta));
assert.ok(!("youVoted" in stream.meta));
assert.ok(stream.seats.every((s) => !("kind" in s)));
assert.ok(!JSON.stringify(stream).includes(bot.id));

room.openWindow(human.id, { maxLen: 120 });
room.submit(human.id, "human sealed");
stream = room.streamView();
assert.strictEqual(stream.window.open, true);
assert.strictEqual(stream.window.submitted, 1);
assert.ok(!("yourDraft" in stream.window));
assert.ok(!JSON.stringify(stream).includes("human sealed"));

room.closeWindow(human.id, { reveal: true });
stream = room.streamView();
assert.strictEqual(stream.window, null);
assert.ok(stream.channels.public.some((m) => m.text === "human sealed"));

const viaHelper = getStreamView(room);
assert.strictEqual(viaHelper.mode, "stream");
assert.strictEqual(viaHelper.seats.length, stream.seats.length);

console.log("room.stream.selftest: ok");
