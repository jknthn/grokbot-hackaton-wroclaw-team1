/** Per-agent projection. Own role facts stay; other seats stay public. */

const META_KEYS = [
  "cityPoints",
  "slowdown",
  "crisisPrompt",
  "talkPrompt",
  "winner",
  "votesCast",
  "votesNeeded",
  "youVoted",
  "yourVoteTarget",
  "guide",
  "lastTown",
  "livingCount",
  "nightStage",
  "shadowLabel",
  "canBlockNight",
  "shadowVotesCast",
  "shadowVotesNeeded",
  "youShadowVoted",
  "humanTargets",
];

function copyMessage(channel, message) {
  const text = String(message?.text ?? "");
  const name = String(message?.name ?? "");
  const ts = Number(message?.ts) || 0;
  if (channel === "shadow") {
    return { name, text, ts };
  }
  return {
    fromSeat: Number(message?.fromSeat),
    name,
    text,
    ts,
  };
}

function copyMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const out = {};
  for (const key of META_KEYS) {
    if (meta[key] !== undefined) out[key] = meta[key];
  }
  return out;
}

function agentState(room, playerId) {
  const view = room.viewFor(playerId);
  if (!view) return null;
  const player = room.players.get(playerId);
  const channels = {};
  for (const [name, messages] of Object.entries(view.channels || {})) {
    channels[name] = (messages || []).map((message) => copyMessage(name, message));
  }
  const act = Array.isArray(view.allowed?.act) ? view.allowed.act : [];
  return {
    version: room.revision,
    phase: view.phase,
    phases: view.phases,
    terminal: view.phase === "ended" || view.phase === "done",
    you: {
      playerId: view.you.playerId,
      seatId: view.you.seatId,
      name: view.you.name,
      alive: Boolean(view.you.alive),
      kind: view.you.kind,
      host: Boolean(view.you.host),
      persona: player?.meta?.persona || null,
      shadowLabel: player?.meta?.shadowLabel || view.meta?.shadowLabel || null,
    },
    seats: (view.seats || []).map((seat) => ({
      seatId: seat.seatId,
      name: seat.name,
      alive: Boolean(seat.alive),
    })),
    channels,
    window: view.window
      ? {
          open: true,
          maxLen: view.window.maxLen,
          submitted: view.window.submitted,
          youSubmitted: Boolean(view.window.youSubmitted),
          yourDraft: view.window.yourDraft,
        }
      : null,
    allowed: {
      say: [...(view.allowed?.say || [])],
      act: act.filter((type) => type !== "submit"),
      submit: act.includes("submit"),
    },
    meta: copyMeta(view.meta),
    lobby: view.lobby || null,
  };
}

module.exports = { agentState, META_KEYS };
