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

module.exports = {
  PACKS,
  DEFAULT_THEME,
  listThemes,
  getPack,
  isTheme,
};
