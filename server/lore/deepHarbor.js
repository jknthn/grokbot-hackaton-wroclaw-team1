/** Foggy harbor lore name + persona pool. */

const { makeDeal } = require("./deal");

const ENTRIES = [
  { name: "Captain Reed", persona: "Harbor pilot who knows which berths stay dark." },
  { name: "Moll Brine", persona: "Fishmonger who prices silence higher than cod." },
  { name: "Ivy Dock", persona: "Lighthouse keeper; watches more than ships." },
  { name: "Jonah Greaves", persona: "Net mender with salt in every sentence." },
  { name: "Clara Pew", persona: "Customs clerk who stamps what she chooses." },
  { name: "Ned Hook", persona: "Tugboat hand; never misses a night run." },
  { name: "Sera Quill", persona: "Map seller drawing coasts that shift." },
  { name: "Bram Tide", persona: "Wharf guard who sleeps with one eye open." },
  { name: "Lark Fen", persona: "Innkeep above the chandlery; rooms by rumor." },
  { name: "Otto Crane", persona: "Crane operator; sees every crate from above." },
  { name: "Willa Moss", persona: "Apothecary for coughs, curses, and cold feet." },
  { name: "Percy Drift", persona: "Smuggler's cousin who insists he is retired." },
  { name: "Hanna Vale", persona: "Choir lead who hears confessions after practice." },
  { name: "Gus Peller", persona: "Shipwright measuring lies like lumber." },
  { name: "Nora Ash", persona: "Foghorn tech; timing is everything." },
  { name: "Eli Marsh", persona: "Ferry ticket boy who remembers faces." },
];

module.exports = {
  theme: "deepHarbor",
  themeLabel: "Deep Harbor",
  ENTRIES,
  deal: makeDeal(ENTRIES),
};
