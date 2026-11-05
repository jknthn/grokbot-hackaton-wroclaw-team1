const assert = require("assert");
const town = require("./rules/town");
const { createRoom } = require("./room");

const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
room.addBot(human.id, { name: "Extra" });

const lobby = room.viewFor(human.id).lobby;
assert.strictEqual(lobby.humanCount, 1);
assert.strictEqual(lobby.readyHumans, 0);
assert.ok(room.viewFor(human.id).allowed.act.includes("ready"));

room.handleAct(human.id, "ready", {});
assert.strictEqual(human.meta.ready, true);
assert.strictEqual(room.viewFor(human.id).lobby.readyHumans, 1);
assert.ok(room.allHumansReady());

const started = room.tryAutoStart("wildWest");
assert.ok(started.ok);
assert.strictEqual(room.phase, "talk");
assert.strictEqual(room.meta.theme, "wildWest");
assert.ok(room.meta.talkPrompt || room.channels.public.some((m) => /^DAY:/i.test(m.text)));

const again = room.tryAutoStart("wildWest");
assert.strictEqual(again.ok, false);
assert.strictEqual(again.reason, "not_lobby");

console.log("room.ready.selftest: ok");
