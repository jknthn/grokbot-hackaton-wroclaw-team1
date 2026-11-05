const wildWest = require("./wildWest");
const spaceColony = require("./spaceColony");
const northJersey = require("./northJersey");
const deepHarbor = require("./deepHarbor");

const PACKS = {
  [wildWest.theme]: wildWest,
  [spaceColony.theme]: spaceColony,
  [northJersey.theme]: northJersey,
  [deepHarbor.theme]: deepHarbor,
};

const DEFAULT_THEME = wildWest.theme;

function listThemes() {
  return Object.values(PACKS).map((pack) => ({
    id: pack.theme,
    label: pack.themeLabel,
  }));
}

function getPack(themeId) {
  return PACKS[themeId] || PACKS[DEFAULT_THEME];
}

function isTheme(themeId) {
  return Boolean(PACKS[themeId]);
}

function pickTalkPrompt(themeId, index = 0) {
  const pack = getPack(themeId);
  const list = pack.TALK_PROMPTS || wildWest.TALK_PROMPTS;
  return list[Math.abs(Number(index) || 0) % list.length];
}

function pickCrisisPrompt(themeId, index = 0) {
  const pack = getPack(themeId);
  const list = pack.CRISIS_PROMPTS || wildWest.CRISIS_PROMPTS;
  return list[Math.abs(Number(index) || 0) % list.length];
}

module.exports = {
  PACKS,
  DEFAULT_THEME,
  listThemes,
  getPack,
  isTheme,
  pickTalkPrompt,
  pickCrisisPrompt,
};
