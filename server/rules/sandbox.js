/** SandboxRules — game-agnostic proof of kernel (lobby → talk → done). */

const PHASES = ["lobby", "talk", "done"];

const sandbox = {
  phases() {
    return [...PHASES];
  },

  initialPhase() {
    return "lobby";
  },

  onStart(room) {
    if (!room.channels.public) room.channels.public = [];
  },

  onJoin(_room, _player) {
    // no tags / roles in sandbox
  },

  canSay(player, channel, room) {
    if (!player.alive) return false;
    if (channel !== "public") return false;
    return room.phase === "talk";
  },

  canAct(player, type, room) {
    if (!player.alive) return false;
    if (type === "ready") return room.phase === "lobby" || room.phase === "talk";
    return false;
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
    return { ok: false, error: "unknown act" };
  },

  botPrompt(player, _view) {
    return (
      `You are a player in a short group-chat game. Your name is ${player.name}. ` +
      "Stay in character. Write one short casual message (under 20 words). " +
      "Never say you are an AI or a bot."
    );
  },
};

module.exports = sandbox;
