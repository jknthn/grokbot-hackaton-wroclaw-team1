const assert = require("assert");
const town = require("../rules/town");
const { createRoom } = require("../room");
const { startGameMaster } = require("./gameMaster");

(async () => {
  const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
  const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
  room.addBot(human.id, { name: "Extra" });
  room.startGame(human.id);

  const gm = startGameMaster(room, {
    enabled: false,
    windowMs: 40000,
    voteMs: 40000,
    nightTalkMs: 20000,
    favorWriteBonus: 12000,
    againstWriteCut: 12000,
    favorNightCut: 6000,
    againstNightBonus: 8000,
  });

  // Reach into closed tempo via crisis meta side effects by mirroring the formula.
  room.meta.slowdown = "favor";
  assert.strictEqual(room.meta.slowdown, "favor");

  room.meta.cityPoints = 0;
  await town.onCloseWindow(
    {
      phase: "crisis",
      players: room.players,
      channels: { public: [] },
      meta: {
        cityPoints: 0,
        crisisPrompt: "Well?",
        slowdown: null,
      },
    },
    [
      { name: "Ada", text: "ok" },
      { name: "Buck", text: "no" },
    ]
  );

  // Rebuild a crisis close on the live room with weak answers → against, no watch fund.
  room.systemSetPhase("crisis");
  room.meta.cityPoints = 0;
  room.meta.crisisPrompt = "Well failing?";
  room.systemOpenWindow({ maxLen: 160 });
  for (const p of room.players.values()) {
    if (p.alive) room.submit(p.id, "no");
  }
  await room.systemCloseWindow({ reveal: true });
  assert.strictEqual(room.meta.slowdown, "against");
  assert.strictEqual(room.meta.cityPoints, 0, "weak crisis must not get free watch fund");
  assert.ok(
    room.channels.public.some((m) => /shorter|lengthens|against/i.test(m.text)),
    "expected tempo consequence in Town line"
  );

  // Strong answers → favor + points + named feedback when lengths differ.
  room.systemSetPhase("crisis");
  room.meta.cityPoints = 0;
  room.systemOpenWindow({ maxLen: 160 });
  const living = [...room.players.values()].filter((p) => p.alive);
  living.forEach((p, i) => {
    room.submit(
      p.id,
      i === living.length - 1
        ? "ok"
        : `Shore the well with timber, post two guards, and ration until dawn (${p.name}).`
    );
  });
  await room.systemCloseWindow({ reveal: true });
  assert.strictEqual(room.meta.slowdown, "favor");
  assert.ok(room.meta.cityPoints >= 1);
  assert.ok(
    room.channels.public.some((m) => /carried|coasted|longer|shortens/i.test(m.text)),
    "expected mvp/tempo line"
  );

  gm.stop();
  console.log("gm.tempo.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
