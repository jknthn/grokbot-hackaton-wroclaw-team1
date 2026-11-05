const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const sandbox = require("./rules/sandbox");
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
const AUTO_BOT = process.env.AUTO_BOT !== "0";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "..", "public")));

const room = createRoom(sandbox, { joinPin: JOIN_PIN });
/** @type {Map<string, string>} socket.id → playerId */
const socketPlayers = new Map();
/** @type {Array<{ stop: () => void }>} */
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

function withPlayer(socket, fn) {
  const playerId = socketPlayers.get(socket.id);
  if (!playerId) return;
  try {
    fn(playerId);
  } catch (err) {
    socket.emit("error_msg", {
      error: err.code || "FAILED",
      message: err.message,
    });
  }
}

io.on("connection", (socket) => {
  socket.on("join", (payload = {}, ack) => {
    try {
      const player = room.join({
        name: payload.name,
        host: Boolean(payload.host),
        pin: payload.pin,
        kind: "human",
      });
      socketPlayers.set(socket.id, player.id);
      const view = room.viewFor(player.id);
      socket.emit("joined", { playerId: player.id, seatId: player.seatId });
      socket.emit("state", { view });
      pushAll();
      if (typeof ack === "function") ack({ ok: true, playerId: player.id, seatId: player.seatId });
    } catch (err) {
      const error = err.code || "JOIN_FAILED";
      socket.emit("error_msg", { error, message: err.message });
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

  socket.on("disconnect", () => {
    socketPlayers.delete(socket.id);
    // Keep player in room for M0 simplicity (reconnect = re-join as new seat)
  });
});

if (AUTO_BOT) {
  const handle = startBotPlayer(room, { name: process.env.BOT_NAME || "Grok-1" });
  botHandles.push(handle);
  console.log(`[bot] joined as ${handle.player.name} (seat ${handle.player.seatId})`);
}

server.listen(PORT, HOST, () => {
  console.log("");
  console.log(`  Game kernel listening on http://${HOST}:${PORT}`);
  console.log(`  JOIN_PIN set (len=${String(JOIN_PIN).length}); always also accepts 4821`);
  if (HOST === "127.0.0.1") {
    console.log("  Local bind. Teammates: ngrok http " + PORT + " — or deploy (see README).");
  } else {
    console.log("  Public bind. Share this service URL + JOIN_PIN with players.");
  }
  console.log("");
});

process.on("SIGINT", () => {
  for (const h of botHandles) h.stop();
  process.exit(0);
});
