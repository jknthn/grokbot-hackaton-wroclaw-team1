const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const sandbox = require("./rules/sandbox");
const town = require("./rules/town");
const { createRoom } = require("./room");
const { startBotPlayer } = require("./players/botPlayer");

const PORT = Number(process.env.PORT || 3000);
// Local default: localhost (pair with ngrok). Deploy/platforms: 0.0.0.0
const HOST =
  process.env.HOST ||
  (process.env.NODE_ENV === "production" || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT
    ? "0.0.0.0"
    : "127.0.0.1");
const JOIN_PIN = process.env.JOIN_PIN || "4821";
const USE_SANDBOX = process.env.RULES === "sandbox";
const rules = USE_SANDBOX ? sandbox : town;
const AUTO_BOT = USE_SANDBOX && process.env.AUTO_BOT !== "0";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Dining-hall UI imports Three as ESM. Serve the package as-is (no bundler).
app.use(
  "/vendor/three",
  express.static(path.join(__dirname, "..", "node_modules", "three"))
);
app.use(express.static(path.join(__dirname, "..", "public")));

const room = createRoom(rules, { joinPin: JOIN_PIN });
/** @type {Map<string, string>} socket.id → playerId */
const socketPlayers = new Map();
/** @type {Array<{ stop: () => void, player?: { id: string } }>} */
const botHandles = [];

function pushAll() {
  for (const [socketId, playerId] of socketPlayers) {
    const sock = io.sockets.sockets.get(socketId);
    if (!sock) continue;
    const view = room.viewFor(playerId);
    if (view) sock.emit("state", { view });
  }
}

room.onUpdate(pushAll);

async function withPlayer(socket, fn) {
  const playerId = socketPlayers.get(socket.id);
  if (!playerId) return;
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

function stopAllBots() {
  for (const h of botHandles) h.stop();
  botHandles.length = 0;
}

function seedAutoBot() {
  if (!AUTO_BOT) return;
  const handle = startBotPlayer(room, { name: process.env.BOT_NAME || "Grok-1" });
  botHandles.push(handle);
  console.log(`[bot] joined as ${handle.player.name} (seat ${handle.player.seatId})`);
}

function clearTableSockets() {
  socketPlayers.clear();
  for (const sock of io.sockets.sockets.values()) {
    sock.emit("room_cleared", {});
  }
}

io.on("connection", (socket) => {
  socket.on("join", (payload = {}, ack) => {
    try {
      let player;
      if (USE_SANDBOX) {
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
        const handle = startBotPlayer(room, {
          name: pair.bot.name,
          existingPlayer: pair.bot,
        });
        botHandles.push(handle);
      }
      bindSocket(socket, player);
      emitJoined(socket, player, ack);
    } catch (err) {
      const error = err.code || "JOIN_FAILED";
      socket.emit("error_msg", { error, message: err.message });
      if (typeof ack === "function") ack({ ok: false, error, message: err.message });
    }
  });

  socket.on("resume", (payload = {}, ack) => {
    try {
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
    withPlayer(socket, (playerId) => {
      const bot = room.addBot(playerId, { name: payload.name });
      const handle = startBotPlayer(room, {
        name: bot.name,
        existingPlayer: bot,
      });
      botHandles.push(handle);
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
  });
});

seedAutoBot();

server.listen(PORT, HOST, () => {
  console.log("");
  console.log(`  Game kernel listening on http://${HOST}:${PORT}`);
  console.log(`  Rules: ${USE_SANDBOX ? "sandbox" : "town"}`);
  console.log(`  JOIN_PIN set (len=${String(JOIN_PIN).length}); always also accepts 4821`);
  if (HOST === "127.0.0.1") {
    console.log("  Local bind. Teammates: ngrok http " + PORT + " — or deploy (see README).");
  } else {
    console.log("  Public bind. Share this service URL + JOIN_PIN with players.");
  }
  console.log("");
});

process.on("SIGINT", () => {
  stopAllBots();
  process.exit(0);
});
