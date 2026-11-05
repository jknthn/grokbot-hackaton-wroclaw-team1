const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const sandbox = require("./rules/sandbox");
const town = require("./rules/town");
const { createRoom } = require("./room");
const { startBotPlayer } = require("./players/botPlayer");
const { startGameMaster } = require("./gm/gameMaster");
const { mountMcp } = require("./mcp/mount");

function envOf(overrides = {}) {
  return { ...process.env, ...overrides };
}

function agentJoinAttempt(room, payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.kind != null && payload.kind !== "human") return true;
  if (payload.access != null && payload.access !== "browser") return true;
  const candidates = [payload.token, payload.sessionToken, payload.agentToken, payload.credential];
  return candidates.some((value) => value != null && value !== "" && room.credentialChannel(value) === "mcp");
}

/**
 * One process, one authoritative room.
 * AGENT_TRANSPORT=mcp disables the in-process bot loop.
 * AGENT_TRANSPORT=builtin (default) keeps pair bots for local/dev play.
 */
function createGameServer(overrides = {}) {
  const env = envOf(overrides);
  const PORT = Number(env.PORT || 3000);
  const HOST =
    env.HOST ||
    (env.NODE_ENV === "production" || env.RENDER || env.RAILWAY_ENVIRONMENT ? "0.0.0.0" : "127.0.0.1");
  const JOIN_PIN = env.JOIN_PIN || "4821";
  const USE_SANDBOX = env.RULES === "sandbox";
  const AGENT_TRANSPORT = env.AGENT_TRANSPORT === "mcp" ? "mcp" : "builtin";
  const AUTO_BOT = AGENT_TRANSPORT !== "mcp" && USE_SANDBOX && env.AUTO_BOT !== "0";
  const rules = USE_SANDBOX ? sandbox : town;

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const room = createRoom(rules, { joinPin: JOIN_PIN, agentTransport: AGENT_TRANSPORT });

  mountMcp(app, {
    room,
    provisionSecret: env.MCP_PROVISION_SECRET || "",
    toolRateLimit: env.MCP_TOOL_RATE_LIMIT,
    toolRateWindowMs: env.MCP_TOOL_RATE_WINDOW_MS,
    provisionRateLimit: env.MCP_PROVISION_RATE_LIMIT,
    provisionRateWindowMs: env.MCP_PROVISION_RATE_WINDOW_MS,
  });

  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir));
  app.get("/stream", (_req, res) => {
    res.sendFile(path.join(publicDir, "stream.html"));
  });

  /** @type {Map<string, string>} socket.id → playerId */
  const socketPlayers = new Map();
  /** @type {Set<string>} socket.id — TV / spectator clients */
  const streamSockets = new Set();
  /** @type {Array<{ stop: () => void, player?: { id: string } }>} */
  const botHandles = [];
  /** @type {{ stop: () => void } | null} */
  let gmHandle = null;

  function pushStream() {
    const view = room.streamView();
    for (const socketId of [...streamSockets]) {
      const sock = io.sockets.sockets.get(socketId);
      if (!sock) {
        streamSockets.delete(socketId);
        continue;
      }
      sock.emit("stream", { view });
    }
  }

  function pushAll() {
    for (const [socketId, playerId] of socketPlayers) {
      const sock = io.sockets.sockets.get(socketId);
      if (!sock) continue;
      const player = room.players.get(playerId);
      if (!player) continue;
      if (player.access === "mcp") {
        socketPlayers.delete(socketId);
        sock.emit("error_msg", {
          error: "AGENT_CHANNEL",
          message: "agent seats cannot be driven from the browser",
        });
        continue;
      }
      const view = room.viewFor(playerId);
      if (view) sock.emit("state", { view });
    }
    pushStream();
  }

  room.onUpdate(pushAll);

  async function withPlayer(socket, fn) {
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return;
    const player = room.players.get(playerId);
    if (!player || player.access === "mcp") {
      socket.emit("error_msg", {
        error: "AGENT_CHANNEL",
        message: "agent seats cannot be driven from the browser",
      });
      return;
    }
    try {
      await fn(playerId);
    } catch (err) {
      socket.emit("error_msg", {
        error: err.code || "FAILED",
        message: err.message,
      });
    }
  }

  function bindSocket(socket, player) {
    if (!player || player.access === "mcp") {
      const err = new Error("agent seats cannot be driven from the browser");
      err.code = "AGENT_CHANNEL";
      throw err;
    }
    for (const [sid, pid] of [...socketPlayers.entries()]) {
      if (pid === player.id && sid !== socket.id) {
        socketPlayers.delete(sid);
        const old = io.sockets.sockets.get(sid);
        if (old) old.emit("session_taken", {});
      }
    }
    socketPlayers.set(socket.id, player.id);
  }

  function emitJoined(socket, player, ack) {
    const view = room.viewFor(player.id);
    const payload = {
      playerId: player.id,
      seatId: player.seatId,
      token: player.sessionToken,
    };
    socket.emit("joined", payload);
    socket.emit("state", { view });
    pushAll();
    if (typeof ack === "function") ack({ ok: true, ...payload });
  }

  function rejectBrowser(socket, ack, code, message) {
    socket.emit("error_msg", { error: code, message });
    if (typeof ack === "function") ack({ ok: false, error: code, message });
  }

  function stopAllBots() {
    for (const handle of botHandles) handle.stop();
    botHandles.length = 0;
  }

  function attachBuiltinBot(existingPlayer, name) {
    if (AGENT_TRANSPORT === "mcp") {
      const err = new Error("builtin bot loop is disabled when AGENT_TRANSPORT=mcp");
      err.code = "MCP_ONLY";
      throw err;
    }
    const handle = startBotPlayer(room, {
      name: name || existingPlayer?.name,
      existingPlayer,
    });
    botHandles.push(handle);
    return handle;
  }

  function seedAutoBot() {
    if (!AUTO_BOT) return;
    const handle = attachBuiltinBot(undefined, env.BOT_NAME || "Grok-1");
    console.log(`[bot] joined as ${handle.player.name} (seat ${handle.player.seatId})`);
  }

  function clearTableSockets() {
    socketPlayers.clear();
    for (const sock of io.sockets.sockets.values()) {
      if (streamSockets.has(sock.id)) continue;
      sock.emit("room_cleared", {});
    }
    pushStream();
  }

  io.on("connection", (socket) => {
    socket.on("observe", (_payload, ack) => {
      streamSockets.add(socket.id);
      socketPlayers.delete(socket.id);
      const view = room.streamView();
      socket.emit("stream", { view });
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("join", (payload = {}, ack) => {
      try {
        if (agentJoinAttempt(room, payload)) {
          rejectBrowser(
            socket,
            ack,
            "AGENT_CHANNEL",
            "browser clients cannot join or seize an MCP agent seat"
          );
          return;
        }
        streamSockets.delete(socket.id);
        let player;
        if (AGENT_TRANSPORT === "mcp" || USE_SANDBOX) {
          player = room.join({
            name: payload.name,
            host: Boolean(payload.host),
            pin: payload.pin,
            kind: "human",
          });
        } else {
          const pair = room.joinPair({
            name: payload.name,
            host: Boolean(payload.host),
            pin: payload.pin,
          });
          player = pair.human;
          attachBuiltinBot(pair.bot, pair.bot.name);
        }
        bindSocket(socket, player);
        emitJoined(socket, player, ack);
      } catch (err) {
        const error = err.code || "JOIN_FAILED";
        rejectBrowser(socket, ack, error, err.message);
      }
    });

    socket.on("resume", (payload = {}, ack) => {
      try {
        if (agentJoinAttempt(room, payload) || room.credentialChannel(payload.token) === "mcp") {
          rejectBrowser(
            socket,
            ack,
            "AGENT_CHANNEL",
            "agent credentials cannot be used on the browser channel"
          );
          return;
        }
        const player = room.resume(payload.token);
        bindSocket(socket, player);
        emitJoined(socket, player, ack);
      } catch (err) {
        const error = err.code || "RESUME_FAILED";
        if (typeof ack === "function") ack({ ok: false, error, message: err.message });
      }
    });

    socket.on("say", (payload = {}) => {
      withPlayer(socket, (playerId) => {
        room.handleSay(playerId, payload.channel || "public", payload.text);
      });
    });

    socket.on("act", (payload = {}) => {
      withPlayer(socket, (playerId) => {
        room.handleAct(playerId, payload.type, payload.payload);
      });
    });

    socket.on("setPhase", (payload = {}) => {
      withPlayer(socket, (playerId) => {
        room.setPhase(playerId, payload.phase);
      });
    });

    socket.on("openWindow", (payload = {}) => {
      withPlayer(socket, (playerId) => {
        room.openWindow(playerId, { maxLen: payload.maxLen });
      });
    });

    socket.on("closeWindow", (payload = {}) => {
      withPlayer(socket, (playerId) => {
        room.closeWindow(playerId, { reveal: payload.reveal !== false });
      });
    });

    socket.on("submit", (payload = {}) => {
      withPlayer(socket, (playerId) => {
        room.submit(playerId, payload.text);
      });
    });

    socket.on("addBot", (payload = {}) => {
      if (AGENT_TRANSPORT === "mcp") {
        socket.emit("error_msg", {
          error: "MCP_ONLY",
          message: "builtin bots are disabled; provision an MCP agent instead",
        });
        return;
      }
      withPlayer(socket, (playerId) => {
        const bot = room.addBot(playerId, { name: payload.name });
        attachBuiltinBot(bot, bot.name);
      });
    });

    socket.on("setAlive", (payload = {}) => {
      withPlayer(socket, (playerId) => {
        room.setAlive(playerId, payload.seatId, payload.alive);
      });
    });

    socket.on("setTheme", (payload = {}) => {
      withPlayer(socket, (playerId) => {
        room.setTheme(playerId, payload.theme);
      });
    });

    socket.on("startGame", () => {
      withPlayer(socket, (playerId) => {
        room.startGame(playerId);
      });
    });

    socket.on("resetGame", () => {
      withPlayer(socket, (playerId) => {
        room.resetGame(playerId);
      });
    });

    socket.on("resetRoom", () => {
      withPlayer(socket, (playerId) => {
        room.resetRoom(playerId);
        stopAllBots();
        clearTableSockets();
        seedAutoBot();
        pushAll();
      });
    });

    socket.on("disconnect", () => {
      socketPlayers.delete(socket.id);
      streamSockets.delete(socket.id);
    });
  });

  seedAutoBot();

  if (!USE_SANDBOX && env.GM_AUTO !== "0") {
    gmHandle = startGameMaster(room, {
      enabled: true,
      windowMs: env.GM_WINDOW_MS,
      voteMs: env.GM_VOTE_MS,
      nightTalkMs: env.GM_NIGHT_TALK_MS,
      nightVoteMs: env.GM_NIGHT_VOTE_MS,
      nightDefendMs: env.GM_NIGHT_DEFEND_MS,
      tickMs: env.GM_TICK_MS,
    });
  }

  function listen() {
    return new Promise((resolve) => {
      server.listen(PORT, HOST, () => resolve(server.address()));
    });
  }

  function close() {
    stopAllBots();
    if (gmHandle) gmHandle.stop();
    return new Promise((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  }

  return {
    app,
    server,
    io,
    room,
    listen,
    close,
    agentTransport: AGENT_TRANSPORT,
    port: PORT,
    host: HOST,
  };
}

async function main() {
  const game = createGameServer();
  const address = await game.listen();
  const shownHost = game.host;
  const shownPort = typeof address === "object" && address ? address.port : game.port;
  console.log("");
  console.log(`  Game kernel listening on http://${shownHost}:${shownPort}`);
  console.log(`  TV stream: http://${shownHost}:${shownPort}/stream`);
  console.log(`  Rules: ${process.env.RULES === "sandbox" ? "sandbox" : "town"}`);
  console.log(`  Agent transport: ${game.agentTransport}`);
  console.log(`  MCP path: /mcp`);
  const joinPin = process.env.JOIN_PIN || "4821";
  console.log(`  JOIN_PIN set (len=${String(joinPin).length}); always also accepts 4821`);
  if (!process.env.MCP_PROVISION_SECRET) {
    console.log("  MCP provisioning disabled (set MCP_PROVISION_SECRET to issue agent seats).");
  } else {
    console.log("  MCP provisioning enabled at POST /api/mcp/agents");
  }
  if (shownHost === "127.0.0.1") {
    console.log("  Local bind. Teammates: ngrok http " + shownPort + " — or deploy (see README).");
  } else {
    console.log("  Public bind. Share this service URL + JOIN_PIN with human players.");
  }
  console.log("");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
  process.on("SIGINT", () => {
    process.exit(0);
  });
}

module.exports = { createGameServer };
