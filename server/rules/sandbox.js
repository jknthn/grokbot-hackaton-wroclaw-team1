/** SandboxRules — game-agnostic proof of kernel (lobby → talk → done). */

const PHASES = ["lobby", "talk", "done"];

const sandbox = {
  phases() {
    return [...PHASES];
  },

  initialPhase() {
    return "lobby";
  },

  actTypes() {
    return ["ready", "submit"];
  },

  onStart(room) {
    if (!room.channels.public) room.channels.public = [];
  },

  onJoin(_room, _player) {
    // no tags / roles in sandbox
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

  canAdmin(player, _type, _room) {
    return Boolean(player.host);
  },

  visibleChannels(_player, _room) {
    return ["public"];
  },

  publicSeatFields(_viewer, seatPlayer) {
    return {
      seatId: seatPlayer.seatId,
      name: seatPlayer.name,
      kind: seatPlayer.kind,
      alive: seatPlayer.alive,
    };
  },

  onAct(_room, _player, type, _payload) {
    if (type === "ready") return { ok: true };
    if (type === "submit") return { ok: false, error: "use submit socket" };
    return { ok: false, error: "unknown act" };
  },

  botPrompt(player, view) {
    if (view?.window?.open) {
      return (
        `You are a player in a short group game. Your name is ${player.name}. ` +
        "A blind write window is open: write ONE short casual line (under 20 words). " +
        "You cannot see what others are writing. Never say you are an AI or a bot."
      );
    }
    return (
      `You are a player in a short group-chat game. Your name is ${player.name}. ` +
      "Stay in character. Write one short casual message (under 20 words). " +
      "Never say you are an AI or a bot."
    );
  },
};

module.exports = sandbox;
