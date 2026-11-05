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

module.exports = {
  theme: "northJersey",
  themeLabel: "North Jersey",
  ENTRIES,
  deal: makeDeal(ENTRIES),
};
