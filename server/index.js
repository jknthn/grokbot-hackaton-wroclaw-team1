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

function pushAll() {
  for (const [socketId, playerId] of socketPlayers) {
    const sock = io.sockets.sockets.get(socketId);
    if (!sock) continue;
    const view = room.viewFor(playerId);
    if (view) sock.emit("state", { view });
  }
}

room.onUpdate(pushAll);

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
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return;
    try {
      room.handleSay(playerId, payload.channel || "public", payload.text);
    } catch (err) {
      socket.emit("error_msg", { error: err.code || "SAY_FAILED", message: err.message });
    }
  });

  socket.on("act", (payload = {}) => {
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return;
    try {
      room.handleAct(playerId, payload.type, payload.payload);
    } catch (err) {
      socket.emit("error_msg", { error: err.code || "ACT_FAILED", message: err.message });
    }
  });

  socket.on("setPhase", (payload = {}) => {
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return;
    try {
      room.setPhase(playerId, payload.phase);
    } catch (err) {
      socket.emit("error_msg", { error: err.code || "PHASE_FAILED", message: err.message });
    }
  });

  socket.on("disconnect", () => {
    socketPlayers.delete(socket.id);
    // Keep player in room for M0 simplicity (reconnect = re-join as new seat)
  });
});

let botHandle = null;
if (AUTO_BOT) {
  botHandle = startBotPlayer(room, { name: process.env.BOT_NAME || "Grok-1" });
  console.log(`[bot] joined as ${botHandle.player.name} (seat ${botHandle.player.seatId})`);
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
  if (botHandle) botHandle.stop();
  process.exit(0);
});
