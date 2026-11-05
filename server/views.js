/** Build per-player view using active rules. */

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

  const act = [];
  for (const type of ["ready"]) {
    if (rules.canAct(player, type, room)) act.push(type);
  }

  return {
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
    allowed: {
      say,
      act,
      setPhase: Boolean(player.host),
    },
    botPrompt: player.kind === "bot" ? rules.botPrompt(player, null) : undefined,
  };
}

module.exports = { getView };
