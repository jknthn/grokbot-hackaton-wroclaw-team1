/** Build per-player view using active rules. */

const DEFAULT_ACT_TYPES = ["ready", "submit"];
const ADMIN_TYPES = [
  "openWindow",
  "closeWindow",
  "addBot",
  "setAlive",
  "resetGame",
  "resetRoom",
  "startGame",
  "setTheme",
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

  const you = {
    playerId: player.id,
    seatId: player.seatId,
    name: player.name,
    host: player.host,
    alive: player.alive,
    // Always know your own side; other seats stay kind-hidden via publicSeatFields.
    kind: player.kind,
  };

  const view = {
    phase: room.phase,
    phases: rules.phases(),
    you,
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

  if (typeof rules.lobbySummary === "function") {
    view.lobby = rules.lobbySummary(room);
  }

  if (typeof rules.viewMeta === "function") {
    view.meta = rules.viewMeta(room, player);
  }

  if (player.kind === "bot") {
    view.botPrompt = rules.botPrompt(player, view);
  }

  return view;
}

/**
 * TV / spectator broadcast — public fog of war only.
 * No kind, no drafts, no shadow channel, no per-seat private meta.
 */
function getStreamView(room) {
  const rules = room.rules;
  const spectator = {
    id: "stream",
    name: "STREAM",
    seatId: -1,
    kind: "human",
    host: false,
    alive: true,
    tags: [],
    meta: {},
  };

  const living = [...room.players.values()].filter((p) => p.alive);
  const seats = [...room.players.values()]
    .sort((a, b) => a.seatId - b.seatId)
    .map((seatPlayer) => {
      const raw = rules.publicSeatFields(spectator, seatPlayer);
      return {
        seatId: raw.seatId,
        name: raw.name,
        alive: Boolean(raw.alive),
      };
    });

  let windowView = null;
  if (room.window) {
    windowView = {
      open: true,
      maxLen: room.window.maxLen,
      submitted: room.window.drafts.size,
      living: living.length,
    };
  }

  const view = {
    mode: "stream",
    phase: room.phase,
    phases: rules.phases(),
    seats,
    channels: {
      public: room.channels.public ? [...room.channels.public] : [],
    },
    window: windowView,
  };

  if (typeof rules.lobbySummary === "function") {
    view.lobby = rules.lobbySummary(room);
  }

  if (typeof rules.viewMeta === "function") {
    const meta = rules.viewMeta(room, null) || {};
    view.meta = {
      cityPoints: Number(meta.cityPoints) || 0,
      slowdown: meta.slowdown ?? null,
      crisisPrompt: meta.crisisPrompt ?? null,
      talkPrompt: meta.talkPrompt ?? null,
      winner: meta.winner ?? null,
      votesCast: Number(meta.votesCast) || 0,
      votesNeeded: Number(meta.votesNeeded) || living.length,
      guide: meta.guide || null,
      lastTown: meta.lastTown ?? null,
      livingCount: Number(meta.livingCount) || living.length,
      nightStage: meta.nightStage ?? null,
    };
  }

  return view;
}

module.exports = { getView, getStreamView };
