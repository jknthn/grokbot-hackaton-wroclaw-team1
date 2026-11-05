const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");
const { getView } = require("./views");

function createRoom(rules, options = {}) {
  const joinPin = String(options.joinPin ?? process.env.JOIN_PIN ?? "4821");
  const maxSeats = options.maxSeats ?? 8;

  const room = {
    rules,
    joinPin,
    maxSeats,
    phase: rules.initialPhase(),
    players: new Map(),
    channels: { public: [] },
    nextSeat: 0,
    _bus: new EventEmitter(),
  };

  if (typeof rules.onStart === "function") {
    rules.onStart(room);
  }

  function emitUpdate() {
    room._bus.emit("update");
  }

  function listPlayers() {
    return [...room.players.values()];
  }

  function requirePlayer(playerId) {
    const player = room.players.get(playerId);
    if (!player) {
      const err = new Error("unknown player");
      err.code = "UNKNOWN_PLAYER";
      throw err;
    }
    return player;
  }

  function join({ name, kind = "human", host = false, pin }) {
    if (kind === "human" && String(pin ?? "") !== joinPin) {
      const err = new Error("invalid pin");
      err.code = "BAD_PIN";
      throw err;
    }
    const trimmed = String(name || "").trim().slice(0, 24);
    if (!trimmed) {
      const err = new Error("name required");
      err.code = "BAD_NAME";
      throw err;
    }
    if (room.players.size >= maxSeats) {
      const err = new Error("room full");
      err.code = "FULL";
      throw err;
    }

    const hasHost = listPlayers().some((p) => p.host);
    const humansBefore = listPlayers().filter((p) => p.kind === "human").length;
    const player = {
      id: randomUUID(),
      name: trimmed,
      seatId: room.nextSeat++,
      kind,
      host: false,
      alive: true,
      tags: [],
      meta: {},
    };
    // First human is host; or explicit host request if nobody is host yet. Bots never host.
    if (kind === "human" && !hasHost && (humansBefore === 0 || host)) {
      player.host = true;
    }

    room.players.set(player.id, player);
    if (typeof rules.onJoin === "function") rules.onJoin(room, player);
    emitUpdate();
    return player;
  }

  function joinBot({ name }) {
    return join({ name, kind: "bot", pin: joinPin });
  }

  function handleSay(playerId, channel, text) {
    const player = requirePlayer(playerId);
    const body = String(text ?? "").trim().slice(0, 280);
    if (!body) {
      const err = new Error("empty message");
      err.code = "BAD_TEXT";
      throw err;
    }
    if (!room.channels[channel]) {
      const err = new Error("unknown channel");
      err.code = "BAD_CHANNEL";
      throw err;
    }
    if (!rules.canSay(player, channel, room)) {
      const err = new Error("cannot say now");
      err.code = "FORBIDDEN";
      throw err;
    }
    room.channels[channel].push({
      fromSeat: player.seatId,
      name: player.name,
      text: body,
      ts: Date.now(),
    });
    emitUpdate();
  }

  function handleAct(playerId, type, payload) {
    const player = requirePlayer(playerId);
    if (!rules.canAct(player, type, room)) {
      const err = new Error("cannot act now");
      err.code = "FORBIDDEN";
      throw err;
    }
    const result =
      typeof rules.onAct === "function"
        ? rules.onAct(room, player, type, payload)
        : { ok: true };
    if (!result || !result.ok) {
      const err = new Error(result?.error || "act failed");
      err.code = "ACT_FAILED";
      throw err;
    }
    emitUpdate();
    return result;
  }

  function setPhase(playerId, phase) {
    const player = requirePlayer(playerId);
    if (!player.host) {
      const err = new Error("host only");
      err.code = "FORBIDDEN";
      throw err;
    }
    const allowed = rules.phases();
    if (!allowed.includes(phase)) {
      const err = new Error("unknown phase");
      err.code = "BAD_PHASE";
      throw err;
    }
    room.phase = phase;
    emitUpdate();
  }

  function viewFor(playerId) {
    return getView(room, playerId);
  }

  function onUpdate(fn) {
    room._bus.on("update", fn);
    return () => room._bus.off("update", fn);
  }

  return {
    join,
    joinBot,
    handleSay,
    handleAct,
    setPhase,
    viewFor,
    onUpdate,
    get phase() {
      return room.phase;
    },
    get joinPin() {
      return joinPin;
    },
    players: room.players,
    channels: room.channels,
    rules: room.rules,
  };
}

module.exports = { createRoom };
