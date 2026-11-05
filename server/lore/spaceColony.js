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

module.exports = {
  theme: "spaceColony",
  themeLabel: "Space Colony",
  ENTRIES,
  deal: makeDeal(ENTRIES),
};
