const assert = require("assert");
const town = require("./rules/town");
const { createRoom } = require("./room");

const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });

const { human, bot } = room.joinPair({ name: "Alex", pin: "4821", host: true });
assert.strictEqual(room.players.size, 2);
assert.strictEqual(human.kind, "human");
assert.strictEqual(bot.kind, "bot");
assert.strictEqual(human.host, true);
assert.strictEqual(human.meta.pairId, bot.meta.pairId);
assert.strictEqual(human.meta.pairedPlayerId, bot.id);
assert.strictEqual(bot.meta.pairedPlayerId, human.id);

const humanViewLobby = room.viewFor(human.id);
assert.strictEqual(humanViewLobby.you.kind, "human");
assert.ok(humanViewLobby.seats.every((s) => !("kind" in s)));
assert.ok(humanViewLobby.allowed.admin.includes("startGame"));
assert.ok(humanViewLobby.allowed.admin.includes("setTheme"));
assert.ok(humanViewLobby.allowed.admin.includes("addBot"));
assert.strictEqual(humanViewLobby.lobby.pairs, 1);
assert.ok(humanViewLobby.lobby.themes.length >= 4);

const filler = room.addBot(human.id, { name: "Extra" });
assert.strictEqual(filler.kind, "bot");
assert.strictEqual(room.players.size, 3);

const second = room.joinPair({ name: "Sam", pin: "4821" });
assert.strictEqual(room.players.size, 5);
assert.strictEqual(room.viewFor(human.id).lobby.pairs, 2);

room.setTheme(human.id, "spaceColony");
assert.strictEqual(room.meta.selectedTheme, "spaceColony");
assert.throws(
  () => room.setTheme(human.id, "nope"),
  (err) => err.code === "BAD_THEME"
);

const seatsBefore = [...room.players.values()].map((p) => p.seatId).sort((a, b) => a - b);
const idsBefore = [...room.players.values()].map((p) => p.id).sort();

room.startGame(human.id);
assert.strictEqual(room.phase, "talk");
assert.strictEqual(room.meta.theme, "spaceColony");
assert.strictEqual(room.meta.themeLabel, "Space Colony");
assert.ok(room.channels.public.some((m) => m.name === "Town" && /Space Colony/.test(m.text)));

const names = [...room.players.values()].map((p) => p.name);
assert.strictEqual(new Set(names).size, names.length);
assert.ok(names.every((n) => !/^Grok/i.test(n)));
assert.ok([...room.players.values()].every((p) => p.meta.persona));

const seatsAfter = [...room.players.values()].map((p) => p.seatId).sort((a, b) => a - b);
assert.deepStrictEqual(seatsAfter, seatsBefore);
const idsAfter = [...room.players.values()].map((p) => p.id).sort();
assert.deepStrictEqual(idsAfter, idsBefore);

const humanView = room.viewFor(human.id);
assert.strictEqual(humanView.phase, "talk");
assert.strictEqual(humanView.you.kind, "human");
assert.ok(humanView.seats.every((s) => !("kind" in s)));
assert.ok(!humanView.allowed.admin.includes("startGame"));
assert.ok(!JSON.stringify(humanView).includes(bot.id));
assert.ok(!humanView.seats.some((s) => /shadow/i.test(s.name)));

assert.throws(
  () => room.joinPair({ name: "Late", pin: "4821" }),
  (err) => err.code === "LOBBY_CLOSED"
);
assert.throws(
  () => room.join({ name: "Late2", pin: "4821" }),
  (err) => err.code === "LOBBY_CLOSED"
);

assert.throws(
  () => room.startGame(second.human.id),
  (err) => err.code === "FORBIDDEN"
);

room.resetGame(human.id);
assert.strictEqual(room.phase, "lobby");
assert.strictEqual(human.meta.pairId, bot.meta.pairId);
assert.strictEqual(human.name, "Alex");
assert.ok(room.viewFor(human.id).allowed.admin.includes("startGame"));

console.log("room.pair.selftest: ok");
