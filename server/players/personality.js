/** Seeded bot personality rolls — stable per seed, different across bots. */

const VOICES = [
  "curt and clipped; short sentences",
  "folksy and warm; softens hard news",
  "nervous; hedges and second-guesses",
  "dry wit; underplays danger",
  "blunt and impatient; cuts to the point",
  "formal and careful; chooses words slowly",
  "gossipy; leans on what others said",
  "suspicious; questions motives",
];

const HABITS = [
  "often asks one pointed question",
  "rarely asks questions; states a take",
  "echoes a prior speaker then twists it",
  "names a concrete detail from the town",
  "defends someone who sounds alone",
  "pushes the group toward a decision",
  "changes the subject when pressed",
  "admits uncertainty out loud",
];

const TELLS = [
  "sounds a bit too helpful",
  "sounds bored with small talk",
  "sounds like a local who belongs here",
  "sounds new and slightly off-register",
  "sounds loyal to whoever spoke last",
  "sounds ready to accuse lightly",
  "sounds protective of the quiet seats",
  "sounds obsessed with the crisis / town safety",
];

const CADENCE = ["terse", "medium", "rambling-but-under-20-words"];

function hashSeed(str) {
  let h = 2166136261;
  const s = String(str ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function rollPersonality(seedStr) {
  const rng = mulberry32(hashSeed(seedStr));
  const voice = pick(rng, VOICES);
  const habit = pick(rng, HABITS);
  const tell = pick(rng, TELLS);
  const cadence = pick(rng, CADENCE);
  const temperature = Math.round((0.75 + rng() * 0.55) * 100) / 100;
  const speakDelayMs = 800 + Math.floor(rng() * 4500);
  const cannedOffset = Math.floor(rng() * 97);
  return {
    voice,
    habit,
    tell,
    cadence,
    temperature,
    speakDelayMs,
    cannedOffset,
    seed: String(seedStr),
  };
}

function formatForPrompt(personality) {
  if (!personality) return "";
  return (
    `Speech voice: ${personality.voice}. ` +
    `Habit: ${personality.habit}. ` +
    `Social color: ${personality.tell}. ` +
    `Cadence: ${personality.cadence}. ` +
    "Stay distinct from other speakers; do not copy their wording."
  );
}

/** Offline canned lines flavored by voice bucket. */
const CANNED_BY_VOICE = {
  curt: ["Short answer: watch the quiet ones.", "Say it plain.", "Not buying that.", "Next."],
  folksy: ["Aw, let's not rush this.", "I'm with the table on this one.", "Easy now — hear them out."],
  nervous: ["I might be wrong, but…", "Does anyone else feel off?", "Sorry — say that again?"],
  dry: ["Sure. That'll end well.", "Noted, unfortunately.", "Charming theory."],
  blunt: ["That's weak.", "Pick a target and move.", "Stop dancing around it."],
  formal: ["I would advise caution.", "Let us examine that claim.", "I remain unconvinced."],
  gossipy: ["Did you catch what they just implied?", "Someone's covering.", "I heard different."],
  suspicious: ["Why say that now?", "Who benefits?", "Prove it."],
};

function voiceBucket(personality) {
  const v = String(personality?.voice || "").toLowerCase();
  if (v.includes("curt") || v.includes("blunt") || v.includes("impatient")) return "blunt";
  if (v.includes("folksy") || v.includes("warm")) return "folksy";
  if (v.includes("nervous")) return "nervous";
  if (v.includes("dry") || v.includes("wit")) return "dry";
  if (v.includes("formal") || v.includes("careful")) return "formal";
  if (v.includes("gossipy")) return "gossipy";
  if (v.includes("suspicious")) return "suspicious";
  return "curt";
}

function cannedLine(personality, index) {
  const bucket = voiceBucket(personality);
  const lines = CANNED_BY_VOICE[bucket] || CANNED_BY_VOICE.curt;
  const offset = Number(personality?.cannedOffset) || 0;
  return lines[(index + offset) % lines.length];
}

module.exports = {
  VOICES,
  HABITS,
  TELLS,
  rollPersonality,
  formatForPrompt,
  cannedLine,
  hashSeed,
};
