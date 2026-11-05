/** Wild West lore name + persona pool for TownRules start deal. */

const ENTRIES = [
  { name: "Ada Colt", persona: "A sharp-eyed card dealer who trusts few and watches the door." },
  { name: "Buck Redman", persona: "A loud rancher with a soft spot for the town well." },
  { name: "Calico June", persona: "A traveling singer who hears every rumor twice." },
  { name: "Dusty Pike", persona: "A quiet deputy who measures words like bullets." },
  { name: "Eliza Thorn", persona: "The general-store owner; inventory and secrets alike." },
  { name: "Flint Hoyt", persona: "A prospector convinced the next claim will save him." },
  { name: "Grace Quinn", persona: "A schoolteacher who writes names down carefully." },
  { name: "Hank Voss", persona: "A blacksmith who settles arguments with a look." },
  { name: "Iris Bell", persona: "The telegraph clerk; first to know, last to speak." },
  { name: "Jed Mercer", persona: "A stagecoach driver who hates night roads." },
  { name: "Kitty Blaze", persona: "Saloon keeper; pours drinks, collects debts." },
  { name: "Levi Crowe", persona: "A preacher with a past he will not name." },
  { name: "Mara Flint", persona: "A bounty hunter between jobs, always counting exits." },
  { name: "Ned Sawyer", persona: "The undertaker; calm, practical, observant." },
  { name: "Opal Wren", persona: "A herbalist who treats fevers and feuds." },
  { name: "Pete Lang", persona: "A greenhorn cowboy trying to sound local." },
];

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deal(count) {
  const n = Math.max(0, Number(count) || 0);
  if (n > ENTRIES.length) {
    const err = new Error("not enough lore names");
    err.code = "LORE_SHORT";
    throw err;
  }
  return shuffle(ENTRIES).slice(0, n);
}

module.exports = { ENTRIES, deal, theme: "wildWest", themeLabel: "Wild West" };
