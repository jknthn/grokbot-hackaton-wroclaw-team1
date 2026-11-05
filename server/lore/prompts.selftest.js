const assert = require("assert");
const lore = require("./index");

const themes = lore.listThemes();
assert.ok(themes.length >= 4);

for (const t of themes) {
  const pack = lore.getPack(t.id);
  assert.ok(Array.isArray(pack.TALK_PROMPTS) && pack.TALK_PROMPTS.length >= 4, t.id);
  assert.ok(Array.isArray(pack.CRISIS_PROMPTS) && pack.CRISIS_PROMPTS.length >= 4, t.id);
  const talk = lore.pickTalkPrompt(t.id, 0);
  const crisis = lore.pickCrisisPrompt(t.id, 0);
  assert.ok(talk.length > 10, t.id);
  assert.ok(crisis.length > 10, t.id);
  // Concrete rumor crises must include the rumors, not a hollow "four rumors" tease.
  const rumorish = pack.CRISIS_PROMPTS.find((p) => /rumor/i.test(p));
  if (rumorish) {
    assert.ok(
      /:/.test(rumorish) || /,/g.test(rumorish),
      `${t.id} rumor prompt should list concrete rumors`
    );
  }
}

assert.notStrictEqual(
  lore.pickCrisisPrompt("northJersey", 0),
  lore.pickCrisisPrompt("spaceColony", 0)
);

console.log("lore.prompts.selftest: ok");
