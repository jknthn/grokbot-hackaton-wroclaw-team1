const assert = require("assert");
const {
  rollPersonality,
  formatForPrompt,
  cannedLine,
} = require("./personality");
const town = require("../rules/town");
const { createRoom } = require("../room");

const a = rollPersonality("game:bot-a");
const b = rollPersonality("game:bot-b");
const a2 = rollPersonality("game:bot-a");

assert.deepStrictEqual(a, a2);
assert.ok(
  a.voice !== b.voice ||
    a.habit !== b.habit ||
    a.tell !== b.tell ||
    a.cadence !== b.cadence ||
    a.cannedOffset !== b.cannedOffset
);
assert.ok(a.temperature >= 0.7 && a.temperature <= 1.4);
assert.ok(formatForPrompt(a).includes("Speech voice"));
assert.ok(cannedLine(a, 0).length > 0);

const room = createRoom(town, { joinPin: "4821", maxSeats: 8 });
const { human, bot } = room.joinPair({ name: "Alex", pin: "4821", host: true });
const second = room.joinPair({ name: "Sam", pin: "4821" });
room.startGame(human.id);

assert.ok(bot.meta.personality);
assert.ok(second.bot.meta.personality);
assert.ok(!human.meta.personality);
assert.notDeepStrictEqual(bot.meta.personality, second.bot.meta.personality);

const prompt = town.botPrompt(bot, { phase: "talk", window: null, meta: {} });
assert.ok(prompt.includes("Speech voice"));
assert.ok(prompt.includes(bot.meta.personality.habit.split(";")[0].slice(0, 12)) || prompt.includes("Habit:"));

console.log("personality.selftest: ok");
