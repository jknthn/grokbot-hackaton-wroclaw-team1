/** Build per-player view using active rules. */

const DEFAULT_ACT_TYPES = ["ready", "submit"];
const ADMIN_TYPES = [
  "openWindow",
  "closeWindow",
  "addBot",
  "setAlive",
  "resetGame",
  "resetRoom",
];

function getView(room, playerId) {
  const player = room.players.get(playerId);
  if (!player) return null;

  const rules = room.rules;
  const seats = [...room.players.values()]
    .sort((a, b) => a.seatId - b.seatId)
    .map((seatPlayer) => rules.publicSeatFields(player, seatPlayer));

  const channelNames = rules.visibleChannels(player, room);
  const channels = {};
  for (const name of channelNames) {
    channels[name] = room.channels[name] ? [...room.channels[name]] : [];
  }

  const say = [];
  for (const name of Object.keys(room.channels)) {
    if (rules.canSay(player, name, room)) say.push(name);
  }

  const actTypes =
    typeof rules.actTypes === "function" ? rules.actTypes() : DEFAULT_ACT_TYPES;
  const act = [];
  for (const type of actTypes) {
    if (rules.canAct(player, type, room)) act.push(type);
  }

  const admin = [];
  if (player.host) {
    for (const type of ADMIN_TYPES) {
      const ok =
        typeof rules.canAdmin === "function"
          ? rules.canAdmin(player, type, room)
          : true;
      if (ok) admin.push(type);
    }
  }

  let windowView = null;
  if (room.window) {
    const draft = room.window.drafts.get(player.seatId);
    windowView = {
      open: true,
      maxLen: room.window.maxLen,
      submitted: room.window.drafts.size,
      youSubmitted: Boolean(draft),
      yourDraft: draft ? draft.text : null,
    };
  }

  const view = {
    phase: room.phase,
    phases: rules.phases(),
    you: {
      playerId: player.id,
      seatId: player.seatId,
      name: player.name,
      kind: player.kind,
      host: player.host,
      alive: player.alive,
    },
    seats,
    channels,
    window: windowView,
    allowed: {
      say,
      act,
      setPhase: Boolean(player.host),
      admin,
    },
  };

  if (player.kind === "bot") {
    view.botPrompt = rules.botPrompt(player, view);
  }

  return view;
}

module.exports = { getView };
