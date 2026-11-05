const assert = require("assert");
const { fallbackJudge, parseJudgeJson, judge } = require("./judge");

const weak = fallbackJudge({
  answers: [{ name: "A", text: "ok" }],
  livingCount: 2,
});
assert.strictEqual(weak.helped, false);
assert.strictEqual(weak.pointsDelta, 0);
assert.strictEqual(weak.slowdown, "against");

const strong = fallbackJudge({
  answers: [
    { name: "A", text: "We shore up the well with timber before nightfall." },
    { name: "B", text: "Ration water and post two guards at the cistern." },
  ],
  livingCount: 2,
});
assert.strictEqual(strong.helped, true);
assert.strictEqual(strong.pointsDelta, 1);
assert.strictEqual(strong.slowdown, "favor");
assert.ok(strong.mvp === "A" || strong.mvp === "B");
assert.ok(weak.weakest === "A");

assert.deepStrictEqual(parseJudgeJson('noise {"helped":true,"pointsDelta":2,"slowdown":"favor","summary":"ok"} tail'), {
  helped: true,
  pointsDelta: 2,
  slowdown: "favor",
  summary: "ok",
});
assert.strictEqual(parseJudgeJson("not json"), null);

(async () => {
  const offline = await judge(
    { prompt: "Well?", answers: [{ name: "A", text: "short" }], livingCount: 1 },
    { apiKey: null }
  );
  assert.strictEqual(offline.helped, false);

  const mocked = await judge(
    {
      prompt: "Well?",
      answers: [{ name: "A", text: "We fix the well with timber now." }],
      livingCount: 1,
    },
    {
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"helped":true,"pointsDelta":2,"slowdown":"favor","summary":"Solid plan."}',
              },
            },
          ],
        }),
      }),
    }
  );
  assert.strictEqual(mocked.helped, true);
  assert.strictEqual(mocked.pointsDelta, 2);
  assert.strictEqual(mocked.summary, "Solid plan.");

  console.log("crisis.judge.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
