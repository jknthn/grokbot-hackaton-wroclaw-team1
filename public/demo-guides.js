/** Per-step guided focus copy and targets (/demo only). */
window.DEMO_GUIDES = {
  join: {
    headline: "Join the table",
    body: "Click Enter demo or COME IN. This walkthrough uses fake data — no live room or API.",
    targets: [{ type: "el", selector: "#join-screen", pad: 12 }],
  },
  lobby: {
    headline: "Lobby · round table",
    body: "Eight guests wait before the deal. The host would pick Wild West and press START — use NEXT STEP here.",
    targets: [
      { type: "canvas", pad: 8 },
      { type: "el", selector: "#start-game-btn", pad: 6 },
    ],
  },
  deal: {
    headline: "Names dealt",
    body: "Lore names appear on the table. Public chat opens on the record — kind stays hidden.",
    targets: [
      { type: "seat", seatId: 4, pad: 48 },
      { type: "el", selector: "#chat-wrap", pad: 6 },
    ],
  },
  blind: {
    headline: "Blind write open",
    body: "Each player seals one line. Watch the SUBMIT row — that is the real blind window, not SAY.",
    targets: [
      { type: "el", selector: "#window-banner", pad: 4 },
      { type: "el", selector: "#submit-form", pad: 8 },
    ],
  },
  sealed: {
    headline: "Line sealed",
    body: "Your answer is in. The banner count shows how many seats submitted before reveal.",
    targets: [
      { type: "el", selector: "#your-draft", pad: 6 },
      { type: "el", selector: "#window-banner", pad: 6 },
    ],
  },
  reveal: {
    headline: "Reveal on the record",
    body: "Sealed lines land in public chat together. Read what everyone said before crisis.",
    targets: [{ type: "el", selector: "#chat", pad: 8 }],
  },
  crisis: {
    headline: "Crisis answer",
    body: "One sealed answer per seat about the well. SUBMIT sends your crisis line.",
    targets: [
      { type: "el", selector: "#chat .msg:last-child", pad: 6 },
      { type: "el", selector: "#submit-form", pad: 8 },
    ],
  },
  "crisis-done": {
    headline: "City points",
    body: "The town judges answers. City points update — they can matter later at night.",
    targets: [
      { type: "el", selector: "#city-points", pad: 6 },
      { type: "el", selector: "#chat", pad: 6 },
    ],
  },
  vote: {
    headline: "Vote a seat",
    body: "Click a guest in the hall or use NEXT. Majority removes a seat — no team reveal.",
    targets: [
      { type: "seat", seatId: 5, pad: 56 },
      { type: "el", selector: "#phase-label", pad: 8 },
    ],
  },
  "vote-cast": {
    headline: "Vote resolved",
    body: "Flint Hoyt leaves the table. The record shows the town line — roles stay hidden.",
    targets: [
      { type: "seat", seatId: 5, pad: 48 },
      { type: "el", selector: "#chat", pad: 6 },
    ],
  },
  night: {
    headline: "Night falls",
    body: "Lights drop in the hall. Humans wait — shadows act off-screen in the real game.",
    targets: [{ type: "canvas", pad: 10 }],
  },
  ended: {
    headline: "Round over",
    body: "Town message on the record. Demo outcome: humans win. Reset or leave the page.",
    targets: [
      { type: "el", selector: "#phase-label", pad: 8 },
      { type: "el", selector: "#chat", pad: 6 },
    ],
  },
};
