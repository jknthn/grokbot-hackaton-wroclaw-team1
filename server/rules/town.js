/** TownRules — locked loop v1 setup slice (lobby pairs → start → talk). */

const wildWest = require("../lore/wildWest");

const PHASES = ["lobby", "talk", "crisis", "vote", "night", "ended"];

const town = {
  phases() {
    return [...PHASES];
  },

  initialPhase() {
    return "lobby";
  },

  postStartPhase() {
    return "talk";
  },

  hideKind() {
    return true;
  },

  actTypes() {
    return ["ready", "submit"];
  },

  onStart(room) {
    if (!room.channels.public) room.channels.public = [];
    if (!room.meta) room.meta = {};
  },

  onJoin(_room, _player) {},

  onReset(room) {
    if (!room.channels.public) room.channels.public = [];
    if (!room.meta) room.meta = {};
    room.meta.theme = null;
    room.meta.themeLabel = null;
    room.meta.cityPoints = 0;
    room.meta.started = false;
  },

  onStartGame(room) {
    const players = [...room.players.values()];
    const dealt = wildWest.deal(players.length);
    players.forEach((player, i) => {
      const entry = dealt[i];
      if (!player.meta) player.meta = {};
      if (!player.meta.lobbyName) player.meta.lobbyName = player.name;
      player.name = entry.name;
      player.meta.persona = entry.persona;
      player.meta.loreTheme = wildWest.theme;
    });
    if (!room.meta) room.meta = {};
    room.meta.theme = wildWest.theme;
    room.meta.themeLabel = wildWest.themeLabel;
    room.meta.cityPoints = 0;
    room.meta.started = true;
  },

  lobbySummary(room) {
    const pairIds = new Set();
    for (const p of room.players.values()) {
      if (p.meta?.pairId) pairIds.add(p.meta.pairId);
    }
    return {
      pairs: pairIds.size,
      seats: room.players.size,
      theme: room.meta?.themeLabel || null,
      started: Boolean(room.meta?.started),
    };
  },

  canSay(player, channel, room) {
    if (!player.alive) return false;
    if (room.window) return false;
    if (channel !== "public") return false;
    return room.phase === "talk";
  },

  canAct(player, type, room) {
    if (!player.alive) return false;
    if (type === "ready") return room.phase === "lobby" || room.phase === "talk";
    if (type === "submit") return Boolean(room.window);
    return false;
  },

  canAdmin(player, type, room) {
    if (!player.host) return false;
    if (type === "addBot") return false;
    if (type === "startGame") return room.phase === "lobby";
    if (
      type === "openWindow" ||
      type === "closeWindow" ||
      type === "setAlive" ||
      type === "resetGame" ||
      type === "resetRoom"
    ) {
      return true;
    }
    return false;
  },

  visibleChannels(_player, _room) {
    return ["public"];
  },

  publicSeatFields(_viewer, seatPlayer) {
    return {
      seatId: seatPlayer.seatId,
      name: seatPlayer.name,
      alive: seatPlayer.alive,
    };
  },

  onAct(_room, _player, type, _payload) {
    if (type === "ready") return { ok: true };
    if (type === "submit") return { ok: false, error: "use submit socket" };
    return { ok: false, error: "unknown act" };
  },

  botPrompt(player, view) {
    const persona = player.meta?.persona || "A townsfolk with a careful tongue.";
    const base =
      `You are a bot in a town game. Your public name is ${player.name}. ` +
      `Persona: ${persona}. ` +
      "Your team (all bots) wins together, including bots who die. Thin the humans. " +
      "Never confess you are a bot or an AI. Do not reveal who else might be a bot.";
    if (view?.window?.open) {
      return (
        base +
        " A blind write window is open: write ONE short in-character line (under 20 words)."
      );
    }
    return base + " Write one short in-character line (under 20 words) when you speak.";
  },
};

module.exports = town;
