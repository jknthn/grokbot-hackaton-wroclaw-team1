const assert = require("assert");
const town = require("./rules/town");
const { createRoom } = require("./room");

(async () => {
  const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
  const { human } = room.joinPair({ name: "Alex", pin: "4821", host: true });
  room.addBot(human.id, { name: "BotTwo" });
  room.addBot(human.id, { name: "BotThree" });
  assert.strictEqual(room.players.size, 4);

  room.startGame(human.id);
  assert.strictEqual(room.phase, "talk");
  assert.strictEqual(room.meta.cityPoints, 0);

  const humanViewTalk = room.viewFor(human.id);
  assert.ok(humanViewTalk.meta);
  assert.strictEqual(humanViewTalk.meta.cityPoints, 0);
  assert.ok(humanViewTalk.allowed.admin.includes("openWindow"));

  room.setPhase(human.id, "crisis");
  assert.strictEqual(room.phase, "crisis");
  assert.ok(room.meta.crisisPrompt);
  assert.ok(room.channels.public.some((m) => /CRISIS/i.test(m.text)));

  const viewCrisis = room.viewFor(human.id);
  assert.strictEqual(viewCrisis.meta.crisisPrompt, room.meta.crisisPrompt);
  assert.ok(viewCrisis.allowed.admin.includes("openWindow"));

  room.openWindow(human.id, { maxLen: 160 });
  const solid =
    "We shore the well with timber and post two guards before nightfall.";
  for (const p of room.players.values()) {
    room.submit(p.id, `${solid} (${p.name})`);
  }

  await room.closeWindow(human.id, { reveal: true });
  assert.strictEqual(room.window, null);
  assert.ok(room.meta.cityPoints >= 1);
  assert.ok(
    room.channels.public.some((m) => /City points/i.test(m.text)),
    "expected judge summary on public"
  );

  const after = room.viewFor(human.id);
  assert.ok(after.meta.cityPoints >= 1);

  room.setPhase(human.id, "talk");
  assert.strictEqual(room.phase, "talk");

  console.log("room.crisis.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
