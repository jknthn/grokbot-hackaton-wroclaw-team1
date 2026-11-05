/** Space colony lore name + persona pool. */

const { makeDeal } = require("./deal");

const ENTRIES = [
  { name: "Orbit Vale", persona: "Dock chief who logs every airlock cycle twice." },
  { name: "Nova Kade", persona: "Survey pilot who trusts instruments more than people." },
  { name: "Lyra Chen", persona: "Hydroponics lead; plants never lie, crews do." },
  { name: "Rex Halden", persona: "Hull welder with a scar and a short temper." },
  { name: "Sable Voss", persona: "Comms officer who hears every private channel." },
  { name: "Juno Park", persona: "Medbay tech who keeps the body count off the board." },
  { name: "Torin Blake", persona: "Security walker; boots loud, questions louder." },
  { name: "Mira Sol", persona: "Navigator who claims the stars still talk back." },
  { name: "Cadence Wu", persona: "Reactor apprentice who never leaves mid-shift." },
  { name: "Ivy Rourke", persona: "Quartermaster counting rations like votes." },
  { name: "Dax Morrow", persona: "Drone wrangler; better with machines than small talk." },
  { name: "Helen Quill", persona: "Colony archivist filing rumors as carefully as facts." },
  { name: "Pike Anders", persona: "EVA specialist who hates sealed rooms." },
  { name: "Rin Okada", persona: "Life-support engineer; air is politics." },
  { name: "Vince Holt", persona: "Cargo broker between Earth runs and local debts." },
  { name: "Tess Marin", persona: "School tutor for kids born off-world." },
];

const TALK_PROMPTS = [
  "Name one crewmate you trust with the airlock codes — and why.",
  "Who on this deck is hiding a tell, and what is it?",
  "Which systems rumor would strand us before the next cycle?",
  "Who should take night EVA watch, and why them?",
  "Name the seat you would not leave alone in medbay.",
];

const CRISIS_PROMPTS = [
  "Life support is dropping 4%. What do we do before the next sleep cycle?",
  "An airlock seal is failing. Where do we stage, and who holds the door?",
  "Four rumors on the board: reactor leak, ration theft, rogue drone, fake Earth packet. Which two do we act on?",
  "Comms to Earth are dark. Who do we send on the relay run, and with what message?",
  "Fire starts in hydroponics. What is the first move that saves the colony?",
];

module.exports = {
  theme: "spaceColony",
  themeLabel: "Space Colony",
  ENTRIES,
  TALK_PROMPTS,
  CRISIS_PROMPTS,
  deal: makeDeal(ENTRIES),
};
