/** North Jersey sit-down lore name + persona pool. */

const { makeDeal } = require("./deal");

const ENTRIES = [
  { name: "Tony Rivetti", persona: "Table regular who remembers every favor owed." },
  { name: "Gina Marcone", persona: "Runs the coat check and the gossip pipeline." },
  { name: "Sal Bianchi", persona: "Quiet driver; hears everything from the front seat." },
  { name: "Nina Caputo", persona: "Bartender who pours short when trust runs thin." },
  { name: "Joey D'Angelo", persona: "Kitchen lead who never sits with his back to the door." },
  { name: "Rita Falco", persona: "Bookkeeper; numbers don't forget." },
  { name: "Vince Pell", persona: "Doorman with a soft voice and hard rules." },
  { name: "Carla Russo", persona: "Florist next door who sees who comes late." },
  { name: "Mickey Trent", persona: "Pool-hall hustler between bigger jobs." },
  { name: "Angela Voss", persona: "Lawyer's cousin; careful with names." },
  { name: "Paulie Knox", persona: "Union steward who talks like a sermon." },
  { name: "Donna Hale", persona: "Diner owner; coffee and alibis both hot." },
  { name: "Frankie Cole", persona: "Mechanic who can make any plate disappear." },
  { name: "Lena Ortiz", persona: "Night nurse who clocks every bruise." },
  { name: "Ray Moretti", persona: "Old-school waiter who never writes anything down." },
  { name: "Chris Bell", persona: "New face from out of town, trying too hard." },
];

const TALK_PROMPTS = [
  "Name one person at this sit-down you trust with a favor — and why.",
  "Who at this table is hiding a tell, and what is it?",
  "Which rumor would get someone disappeared before morning?",
  "Who should watch the door tonight, and why them?",
  "Name the seat you would not turn your back on.",
];

const CRISIS_PROMPTS = [
  "The back room heat is rising. What do we do before the night sit-down?",
  "A shipment is late and the docks are quiet. Where do we move, and who we send?",
  "Four rumors: pinched books, a snitch at the diner, a missing envelope, a cousin from out of town. Which two do we act on?",
  "The phone line to the lawyer is dead. Who do we send, and with what message?",
  "A fire starts behind the kitchen. What is the first move that keeps the table intact?",
];

module.exports = {
  theme: "northJersey",
  themeLabel: "North Jersey",
  ENTRIES,
  TALK_PROMPTS,
  CRISIS_PROMPTS,
  deal: makeDeal(ENTRIES),
};
