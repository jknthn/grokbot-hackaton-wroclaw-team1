const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");
const { getView, getStreamView } = require("./views");

function createRoom(rules, options = {}) {
  const joinPin = String(options.joinPin ?? process.env.JOIN_PIN ?? "4821");
  const maxSeats = options.maxSeats ?? 8;
  const agentTransport = options.agentTransport === "mcp" ? "mcp" : "builtin";
  /** playerId → nested MCP mutation depth. Direct calls stay blocked at 0. */
  const mcpDepth = new Map();

  const room = {
    rules,
    joinPin,
    maxSeats,
    agentTransport,
    phase: rules.initialPhase(),
    players: new Map(),
    channels: { public: [] },
    window: null,
    nextSeat: 0,
    meta: {},
    revision: 0,
    /** @type {Map<string, string>} sessionToken → playerId */
    sessions: new Map(),
    /** @type {Map<string, string>} mcp credential → playerId. Never log keys. */
    mcpCredentials: new Map(),
    /** @type {Set<string>} credentials wiped by resetRoom. Never log values. */
    mcpRevoked: new Set(),
    _bus: new EventEmitter(),
  };

  if (typeof rules.onStart === "function") {
    rules.onStart(room);
  }

  function emitUpdate() {
    room.revision += 1;
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

  function requireHost(playerId) {
    const player = requirePlayer(playerId);
    if (!player.host) {
      const err = new Error("host only");
      err.code = "FORBIDDEN";
      throw err;
    }
    return player;
  }

  function pinAllowed(pin) {
    const given = String(pin ?? "").trim();
    const accepted = new Set(
      [joinPin, options.joinPinAlt, process.env.JOIN_PIN_ALT, "4821"]
        .filter((v) => v != null && String(v).length > 0)
        .map((v) => String(v).trim())
    );
    return accepted.has(given);
  }

  function canAdmin(player, type) {
    if (!player.host) return false;
    if (typeof rules.canAdmin === "function") {
      return rules.canAdmin(player, type, room);
    }
    return true;
  }

  function join({ name, kind = "human", host = false, pin }) {
    // Caller-supplied access/kind cannot create an MCP seat. joinAgent does that.
    const resolvedKind = kind === "bot" ? "bot" : "human";
    const resolvedAccess = resolvedKind === "human" ? "browser" : "builtin";
    if (resolvedKind === "human" && room.phase !== "lobby") {
      const err = new Error("lobby closed");
      err.code = "LOBBY_CLOSED";
      throw err;
    }
    if (resolvedKind === "human" && !pinAllowed(pin)) {
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
      kind: resolvedKind,
      access: resolvedAccess,
      host: false,
      alive: true,
      tags: [],
      meta: { lobbyName: trimmed },
      sessionToken: null,
    };
    // First human is host; or explicit host request if nobody is host yet. Bots never host.
    if (resolvedKind === "human" && !hasHost && (humansBefore === 0 || host)) {
      player.host = true;
    }
    if (resolvedKind === "human") {
      player.sessionToken = issueSession(player.id);
    }

    room.players.set(player.id, player);
    if (typeof rules.onJoin === "function") rules.onJoin(room, player);
    emitUpdate();
    return player;
  }

  function joinPair({ name, pin, host = false }) {
    if (room.phase !== "lobby") {
      const err = new Error("lobby closed");
      err.code = "LOBBY_CLOSED";
      throw err;
    }
    if (room.players.size + 2 > maxSeats) {
      const err = new Error("room full");
      err.code = "FULL";
      throw err;
    }
    const human = join({ name, pin, host, kind: "human" });
    const pairId = randomUUID();
    const botLabel = `${human.name}'s shadow`.slice(0, 24);
    const bot = joinBot({ name: botLabel });
    human.meta.pairId = pairId;
    human.meta.pairedPlayerId = bot.id;
    human.meta.pairedWithSeat = bot.seatId;
    bot.meta.pairId = pairId;
    bot.meta.pairedPlayerId = human.id;
    bot.meta.pairedWithSeat = human.seatId;
    bot.meta.lobbyName = botLabel;
    emitUpdate();
    return { human, bot };
  }

  function announce(text) {
    if (!room.channels.public) room.channels.public = [];
    const body = String(text ?? "").trim().slice(0, 280);
    if (!body) return;
    room.channels.public.push({
      fromSeat: -1,
      name: "Town",
      text: body,
      ts: Date.now(),
    });
  }

  function shuffleSeatIds() {
    const players = listPlayers();
    if (players.length < 2) return;
    const seatIds = players.map((p) => p.seatId);
    for (let i = seatIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seatIds[i], seatIds[j]] = [seatIds[j], seatIds[i]];
    }
    players.forEach((player, i) => {
      player.seatId = seatIds[i];
    });
    room.nextSeat = Math.max(...players.map((p) => p.seatId), -1) + 1;
    for (const player of players) {
      const otherId = player.meta?.pairedPlayerId;
      if (!otherId) continue;
      const other = room.players.get(otherId);
      if (other) player.meta.pairedWithSeat = other.seatId;
    }
  }

  function countPairs() {
    const pairIds = new Set();
    for (const p of listPlayers()) {
      if (p.meta?.pairId) pairIds.add(p.meta.pairId);
    }
    return pairIds.size;
  }

  function applyTheme(themeId) {
    const themes = typeof rules.themes === "function" ? rules.themes() : [];
    const id = String(themeId || "").trim();
    if (themes.length && !themes.some((t) => t.id === id)) {
      const err = new Error("unknown theme");
      err.code = "BAD_THEME";
      throw err;
    }
    if (!room.meta) room.meta = {};
    room.meta.selectedTheme = id;
    return id;
  }

  function setTheme(hostId, themeId) {
    const host = assertNotAgent(requireHost(hostId));
    if (!canAdmin(host, "setTheme")) {
      const err = new Error("cannot set theme now");
      err.code = "FORBIDDEN";
      throw err;
    }
    if (room.phase !== "lobby") {
      const err = new Error("lobby closed");
      err.code = "NOT_LOBBY";
      throw err;
    }
    const id = applyTheme(themeId);
    emitUpdate();
    return id;
  }

  function allHumansReady() {
    const humans = listPlayers().filter((p) => p.kind === "human" && p.alive);
    if (humans.length < 1) return false;
    return humans.every((p) => p.meta?.ready);
  }

  function doStartGame() {
    if (room.phase !== "lobby") {
      const err = new Error("already started");
      err.code = "NOT_LOBBY";
      throw err;
    }
    if (!enoughToStart()) {
      const err = new Error(
        agentTransport === "mcp"
          ? "need a human and at least one MCP agent"
          : "need at least one pair"
      );
      err.code = agentTransport === "mcp" ? "NEED_TABLE" : "NO_PAIRS";
      throw err;
    }
    if (typeof rules.onStartGame === "function") {
      rules.onStartGame(room);
    }
    shuffleSeatIds();
    const nextPhase =
      typeof rules.postStartPhase === "function" ? rules.postStartPhase() : "talk";
    const prev = room.phase;
    room.phase = nextPhase;
    if (typeof rules.onPhaseChange === "function") {
      rules.onPhaseChange(room, prev, nextPhase);
    }
    const themeLabel = room.meta?.themeLabel || "the town";
    announce(
      `The town opens under ${themeLabel}. Lore names are dealt; kind stays hidden. Flow: day talk → crisis → vote → night.`
    );
    emitUpdate();
  }

  function startGame(hostId) {
    const host = assertNotAgent(requireHost(hostId));
    if (!canAdmin(host, "startGame")) {
      const err = new Error("cannot start now");
      err.code = "FORBIDDEN";
      throw err;
    }
    doStartGame();
  }

  function tryAutoStart(themeId) {
    if (room.phase !== "lobby") return { ok: false, reason: "not_lobby" };
    if (!enoughToStart()) {
      return { ok: false, reason: agentTransport === "mcp" ? "need_table" : "no_pairs" };
    }
    if (!allHumansReady()) return { ok: false, reason: "not_ready" };
    if (themeId) applyTheme(themeId);
    for (const p of listPlayers()) {
      if (p.meta) p.meta.ready = false;
    }
    doStartGame();
    return { ok: true };
  }

  function systemSetPhase(phase) {
    const allowed = rules.phases();
    if (!allowed.includes(phase)) {
      const err = new Error("unknown phase");
      err.code = "BAD_PHASE";
      throw err;
    }
    const prev = room.phase;
    room.phase = phase;
    if (typeof rules.onPhaseChange === "function") {
      rules.onPhaseChange(room, prev, phase);
    }
    emitUpdate();
  }

  function systemOpenWindow(opts = {}) {
    if (room.window) {
      const err = new Error("window already open");
      err.code = "WINDOW_OPEN";
      throw err;
    }
    const maxLen = Math.min(Math.max(Number(opts.maxLen) || 160, 1), 280);
    room.window = {
      id: randomUUID(),
      maxLen,
      openedAt: Date.now(),
      drafts: new Map(),
    };
    emitUpdate();
    return room.window;
  }

  async function systemCloseWindow(opts = {}) {
    if (!room.window) {
      const err = new Error("no window open");
      err.code = "NO_WINDOW";
      throw err;
    }
    const reveal = opts.reveal !== false;
    const revealed = [];
    if (reveal) {
      const drafts = [...room.window.drafts.entries()].sort((a, b) => a[0] - b[0]);
      const ts = Date.now();
      for (const [seatId, draft] of drafts) {
        const msg = {
          fromSeat: seatId,
          name: draft.name,
          text: draft.text,
          ts,
        };
        room.channels.public.push(msg);
        revealed.push(msg);
      }
    }
    room.window = null;
    if (typeof rules.onCloseWindow === "function") {
      await rules.onCloseWindow(room, revealed);
    }
    emitUpdate();
    return revealed;
  }

  function resolveVote() {
    if (typeof rules.resolveVotes !== "function") {
      return { removed: null, winner: null };
    }
    const result = rules.resolveVotes(room);
    if (result?.winner) {
      room.meta.winner = result.winner;
      systemSetPhase("ended");
    }
    emitUpdate();
    return result;
  }

  function setNightStage(stage) {
    if (typeof rules.setNightStage === "function") {
      rules.setNightStage(room, stage);
    } else {
      if (!room.meta) room.meta = {};
      if (!room.meta.night) room.meta.night = {};
      room.meta.night.stage = stage;
    }
    emitUpdate();
  }

  function tallyShadowVotes() {
    if (typeof rules.tallyShadowVotes !== "function") {
      return { target: null };
    }
    const result = rules.tallyShadowVotes(room);
    emitUpdate();
    return result;
  }

  function resolveNight() {
    if (typeof rules.resolveNight !== "function") {
      return { killed: null, winner: null };
    }
    const result = rules.resolveNight(room);
    if (result?.winner) {
      room.meta.winner = result.winner;
      systemSetPhase("ended");
    }
    emitUpdate();
    return result;
  }

  function issueSession(playerId) {
    const token = randomUUID();
    room.sessions.set(token, playerId);
    return token;
  }

  function resume(token) {
    const key = String(token ?? "").trim();
    if (credentialChannel(key) === "mcp") {
      const err = new Error("agent credentials cannot be used on the browser channel");
      err.code = "AGENT_CHANNEL";
      throw err;
    }
    if (!key) {
      const err = new Error("session expired");
      err.code = "NO_SESSION";
      throw err;
    }
    const playerId = room.sessions.get(key);
    if (!playerId) {
      const err = new Error("session expired");
      err.code = "NO_SESSION";
      throw err;
    }
    const player = room.players.get(playerId);
    if (!player || player.sessionToken !== key) {
      room.sessions.delete(key);
      const err = new Error("session expired");
      err.code = "NO_SESSION";
      throw err;
    }
    return player;
  }

  function joinBot({ name }) {
    return join({ name, kind: "bot", pin: joinPin });
  }

  function joinAgent({ name }) {
    if (room.phase !== "lobby") {
      const err = new Error("lobby closed");
      err.code = "LOBBY_CLOSED";
      throw err;
    }
    const player = join({ name, kind: "bot", pin: joinPin });
    player.kind = "bot";
    player.access = "mcp";
    player.host = false;
    player.sessionToken = null;
    const token = randomUUID();
    room.mcpCredentials.set(token, player.id);
    emitUpdate();
    return { player, token };
  }

  function rememberRevoked(token) {
    room.mcpRevoked.add(token);
    while (room.mcpRevoked.size > 200) {
      const oldest = room.mcpRevoked.values().next().value;
      room.mcpRevoked.delete(oldest);
    }
  }

  function credentialChannel(token) {
    const key = String(token ?? "").trim();
    if (!key) return null;
    if (room.mcpCredentials.has(key) || room.mcpRevoked.has(key)) return "mcp";
    if (room.sessions.has(key)) return "browser";
    return null;
  }

  function requireMcpPlayer(token) {
    const key = String(token ?? "").trim();
    if (!key) {
      const err = new Error("credentials required");
      err.code = "NO_CREDENTIAL";
      throw err;
    }
    if (room.sessions.has(key)) {
      const err = new Error("browser session cannot be used on the MCP channel");
      err.code = "AGENT_CHANNEL";
      throw err;
    }
    if (room.mcpRevoked.has(key)) {
      const err = new Error("session expired");
      err.code = "SESSION_EXPIRED";
      throw err;
    }
    const playerId = room.mcpCredentials.get(key);
    if (!playerId) {
      const err = new Error("invalid credentials");
      err.code = "BAD_CREDENTIAL";
      throw err;
    }
    const player = room.players.get(playerId);
    if (!player || player.access !== "mcp") {
      room.mcpCredentials.delete(key);
      const err = new Error("session expired");
      err.code = "SESSION_EXPIRED";
      throw err;
    }
    return player;
  }

  function withMcpPlayer(playerId, fn) {
    const player = requirePlayer(playerId);
    if (player.access !== "mcp") {
      const err = new Error("not an MCP seat");
      err.code = "AGENT_CHANNEL";
      throw err;
    }
    mcpDepth.set(playerId, (mcpDepth.get(playerId) || 0) + 1);
    try {
      return fn(player);
    } finally {
      const next = (mcpDepth.get(playerId) || 1) - 1;
      if (next <= 0) mcpDepth.delete(playerId);
      else mcpDepth.set(playerId, next);
    }
  }

  function assertDirectSeat(player) {
    if (player.access === "mcp" && !mcpDepth.get(player.id)) {
      const err = new Error("agent seat is MCP-only");
      err.code = "AGENT_CHANNEL";
      throw err;
    }
  }

  function assertNotAgent(player) {
    if (player.access === "mcp") {
      const err = new Error("agents cannot use host controls");
      err.code = "FORBIDDEN";
      throw err;
    }
    return player;
  }

  function enoughToStart() {
    const players = listPlayers();
    if (agentTransport === "mcp") {
      const humans = players.filter((p) => p.kind === "human" && p.access === "browser").length;
      const agents = players.filter((p) => p.access === "mcp").length;
      return humans >= 1 && agents >= 1;
    }
    return countPairs() >= 1;
  }

  function handleSay(playerId, channel, text) {
    const player = requirePlayer(playerId);
    assertDirectSeat(player);
    if (!player.alive) {
      const err = new Error("dead cannot say");
      err.code = "FORBIDDEN";
      throw err;
    }
    if (room.window) {
      const err = new Error("window open — use submit");
      err.code = "FORBIDDEN";
      throw err;
    }
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
    let displayName = player.name;
    if (
      channel === "shadow" &&
      player.meta?.shadowLabel &&
      room.phase === "night"
    ) {
      displayName = player.meta.shadowLabel;
    }
    room.channels[channel].push({
      fromSeat: player.seatId,
      name: displayName,
      text: body,
      ts: Date.now(),
    });
    emitUpdate();
  }

  function handleAct(playerId, type, payload) {
    const player = requirePlayer(playerId);
    assertDirectSeat(player);
    if (!player.alive) {
      const err = new Error("dead cannot act");
      err.code = "FORBIDDEN";
      throw err;
    }
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
    assertNotAgent(requireHost(playerId));
    const allowed = rules.phases();
    if (!allowed.includes(phase)) {
      const err = new Error("unknown phase");
      err.code = "BAD_PHASE";
      throw err;
    }
    const prev = room.phase;
    room.phase = phase;
    if (typeof rules.onPhaseChange === "function") {
      rules.onPhaseChange(room, prev, phase);
    }
    emitUpdate();
  }

  function openWindow(hostId, opts = {}) {
    const host = assertNotAgent(requireHost(hostId));
    if (!canAdmin(host, "openWindow")) {
      const err = new Error("cannot open window now");
      err.code = "FORBIDDEN";
      throw err;
    }
    if (room.window) {
      const err = new Error("window already open");
      err.code = "WINDOW_OPEN";
      throw err;
    }
    const maxLen = Math.min(Math.max(Number(opts.maxLen) || 160, 1), 280);
    room.window = {
      id: randomUUID(),
      maxLen,
      openedAt: Date.now(),
      drafts: new Map(),
    };
    emitUpdate();
    return room.window;
  }

  async function closeWindow(hostId, opts = {}) {
    const host = assertNotAgent(requireHost(hostId));
    if (!canAdmin(host, "closeWindow")) {
      const err = new Error("cannot close window now");
      err.code = "FORBIDDEN";
      throw err;
    }
    if (!room.window) {
      const err = new Error("no window open");
      err.code = "NO_WINDOW";
      throw err;
    }
    const reveal = opts.reveal !== false;
    const revealed = [];
    if (reveal) {
      const drafts = [...room.window.drafts.entries()].sort((a, b) => a[0] - b[0]);
      const ts = Date.now();
      for (const [seatId, draft] of drafts) {
        const msg = {
          fromSeat: seatId,
          name: draft.name,
          text: draft.text,
          ts,
        };
        room.channels.public.push(msg);
        revealed.push(msg);
      }
    }
    room.window = null;
    if (typeof rules.onCloseWindow === "function") {
      await rules.onCloseWindow(room, revealed);
    }
    emitUpdate();
  }

  function submit(playerId, text) {
    const player = requirePlayer(playerId);
    assertDirectSeat(player);
    if (!player.alive) {
      const err = new Error("dead cannot submit");
      err.code = "FORBIDDEN";
      throw err;
    }
    if (!room.window) {
      const err = new Error("no window open");
      err.code = "NO_WINDOW";
      throw err;
    }
    if (typeof rules.canAct === "function" && !rules.canAct(player, "submit", room)) {
      const err = new Error("cannot submit now");
      err.code = "FORBIDDEN";
      throw err;
    }
    if (room.window.drafts.has(player.seatId)) {
      const err = new Error("already submitted");
      err.code = "ALREADY_SUBMITTED";
      throw err;
    }
    const body = String(text ?? "").trim().slice(0, room.window.maxLen);
    if (!body) {
      const err = new Error("empty message");
      err.code = "BAD_TEXT";
      throw err;
    }
    room.window.drafts.set(player.seatId, {
      text: body,
      name: player.name,
      ts: Date.now(),
    });
    emitUpdate();
  }

  function addBot(hostId, opts = {}) {
    const host = assertNotAgent(requireHost(hostId));
    if (!canAdmin(host, "addBot")) {
      const err = new Error("cannot add bot now");
      err.code = "FORBIDDEN";
      throw err;
    }
    const botCount = listPlayers().filter((p) => p.kind === "bot").length;
    const fallback = `Grok-${botCount + 1}`;
    const name = String(opts.name || fallback).trim().slice(0, 24) || fallback;
    return joinBot({ name });
  }

  function setAlive(hostId, seatId, alive) {
    const host = assertNotAgent(requireHost(hostId));
    if (!canAdmin(host, "setAlive")) {
      const err = new Error("cannot set alive now");
      err.code = "FORBIDDEN";
      throw err;
    }
    const target = listPlayers().find((p) => p.seatId === Number(seatId));
    if (!target) {
      const err = new Error("unknown seat");
      err.code = "UNKNOWN_SEAT";
      throw err;
    }
    target.alive = Boolean(alive);
    emitUpdate();
    return target;
  }

  function resetGame(hostId) {
    const host = assertNotAgent(requireHost(hostId));
    if (!canAdmin(host, "resetGame")) {
      const err = new Error("cannot reset now");
      err.code = "FORBIDDEN";
      throw err;
    }

    room.phase = rules.initialPhase();
    room.window = null;
    for (const key of Object.keys(room.channels)) {
      room.channels[key] = [];
    }
    if (!room.channels.public) room.channels.public = [];

    for (const player of listPlayers()) {
      player.alive = true;
      player.tags = [];
      const lobbyName = player.meta?.lobbyName || player.name;
      const pairId = player.meta?.pairId;
      const pairedPlayerId = player.meta?.pairedPlayerId;
      player.meta = { lobbyName };
      player.name = lobbyName;
      if (pairId) player.meta.pairId = pairId;
      if (pairedPlayerId) {
        player.meta.pairedPlayerId = pairedPlayerId;
        const other = room.players.get(pairedPlayerId);
        if (other) player.meta.pairedWithSeat = other.seatId;
      }
    }
    room.meta = {};

    if (typeof rules.onReset === "function") {
      rules.onReset(room);
    }

    emitUpdate();
  }

  function resetRoom(hostId) {
    const host = assertNotAgent(requireHost(hostId));
    if (!canAdmin(host, "resetRoom")) {
      const err = new Error("cannot clear table now");
      err.code = "FORBIDDEN";
      throw err;
    }

    room.phase = rules.initialPhase();
    room.window = null;
    room.nextSeat = 0;
    room.meta = {};
    room.players.clear();
    room.sessions.clear();
    for (const token of room.mcpCredentials.keys()) rememberRevoked(token);
    room.mcpCredentials.clear();
    mcpDepth.clear();
    for (const key of Object.keys(room.channels)) {
      room.channels[key] = [];
    }
    if (!room.channels.public) room.channels.public = [];

    if (typeof rules.onReset === "function") {
      rules.onReset(room);
    }

    emitUpdate();
  }

  function viewFor(playerId) {
    return getView(room, playerId);
  }

  function streamView() {
    return getStreamView(room);
  }

  function onUpdate(fn) {
    room._bus.on("update", fn);
    return () => room._bus.off("update", fn);
  }

  function waitForRevision(since, timeoutMs) {
    const target = Number(since);
    if (!Number.isFinite(target) || target < 0) {
      const err = new Error("bad version");
      err.code = "BAD_VERSION";
      throw err;
    }
    if (room.revision > target) {
      return Promise.resolve({ version: room.revision, timedOut: false });
    }
    const ms = Math.min(20000, Math.max(0, Number(timeoutMs) || 0));
    return new Promise((resolve) => {
      let done = false;
      const finish = (timedOut) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        off();
        resolve({ version: room.revision, timedOut });
      };
      const off = onUpdate(() => {
        if (room.revision > target) finish(false);
      });
      const timer = setTimeout(() => finish(true), ms);
    });
  }

  return {
    join,
    joinBot,
    joinAgent,
    joinPair,
    credentialChannel,
    requireMcpPlayer,
    withMcpPlayer,
    announce,
    setTheme,
    applyTheme,
    startGame,
    tryAutoStart,
    allHumansReady,
    handleSay,
    handleAct,
    setPhase,
    systemSetPhase,
    openWindow,
    closeWindow,
    systemOpenWindow,
    systemCloseWindow,
    submit,
    addBot,
    setAlive,
    resolveVote,
    setNightStage,
    tallyShadowVotes,
    resolveNight,
    resetGame,
    resetRoom,
    resume,
    viewFor,
    streamView,
    onUpdate,
    waitForRevision,
    get phase() {
      return room.phase;
    },
    get revision() {
      return room.revision;
    },
    get agentTransport() {
      return agentTransport;
    },
    get joinPin() {
      return joinPin;
    },
    get window() {
      return room.window;
    },
    get meta() {
      return room.meta;
    },
    players: room.players,
    channels: room.channels,
    rules: room.rules,
  };
}

module.exports = { createRoom };
