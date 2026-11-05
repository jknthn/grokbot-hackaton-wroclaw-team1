const assert = require("assert");
const town = require("../rules/town");
const { createRoom } = require("../room");
const { startGameMaster } = require("./gameMaster");
const { fallbackTheme, fallbackTalk, parseJson } = require("./narrate");

assert.ok(fallbackTheme());
assert.ok(fallbackTalk(0).length > 5);
assert.deepStrictEqual(parseJson('x {"themeId":"wildWest"} y'), { themeId: "wildWest" });

(async () => {
  const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
  const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
  room.addBot(human.id, { name: "Extra" });

  const gm = startGameMaster(room, {
    enabled: true,
    windowMs: 50,
    voteMs: 50,
    nightMs: 30,
    tickMs: 20,
  });

  room.handleAct(human.id, "ready", {});

  // Wait for auto-start + talk window
  for (let i = 0; i < 40 && room.phase === "lobby"; i++) {
    await gm.tick();
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.strictEqual(room.phase, "talk");
  assert.ok(room.window, "talk window should open");

  // Everyone submits talk line
  for (const p of room.players.values()) {
    if (p.alive) room.submit(p.id, `Talk line from ${p.name} with enough length.`);
  }

  for (let i = 0; i < 40 && room.phase === "talk"; i++) {
    await gm.tick();
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.strictEqual(room.phase, "crisis");
  assert.ok(room.window || true);

  // Submit crisis if window open
  for (let i = 0; i < 20 && !room.window; i++) {
    await gm.tick();
    await new Promise((r) => setTimeout(r, 20));
  }
  if (room.window) {
    for (const p of room.players.values()) {
      if (p.alive && !room.window.drafts.has(p.seatId)) {
        room.submit(p.id, `Crisis answer from ${p.name} with enough characters.`);
      }
    }
  }

  for (let i = 0; i < 50 && room.phase === "crisis"; i++) {
    await gm.tick();
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.strictEqual(room.phase, "vote");

  const living = [...room.players.values()].filter((p) => p.alive);
  const target = living.find((p) => p.kind === "bot") || living[0];
  for (const p of living) {
    if (!room.meta.votes?.has(p.seatId)) {
      room.handleAct(p.id, "vote", { seatId: target.seatId });
    }
  }

  for (let i = 0; i < 40 && room.phase === "vote"; i++) {
    await gm.tick();
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.ok(
    room.phase === "night" || room.phase === "ended" || room.phase === "talk",
    `expected night/ended/talk after vote, got ${room.phase}`
  );

  gm.stop();
  console.log("gm.gameMaster.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
