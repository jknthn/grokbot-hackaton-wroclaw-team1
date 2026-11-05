/** TownRules — locked loop v1 (setup + crisis soft points). */

const { randomUUID } = require("crypto");
const lore = require("../lore");
const { judge } = require("../crisis/judge");
const { rollPersonality, formatForPrompt } = require("../players/personality");

const PHASES = ["lobby", "talk", "crisis", "vote", "night", "ended"];

const CRISIS_PROMPTS = [
  "The well is failing. What do we do before night?",
  "Four rumors are circulating. Which ones should the town act on?",
  "Name the next shelter and why it holds.",
];

function livingPlayers(room) {
  return [...room.players.values()].filter((p) => p.alive);
}

function pushTown(room, text) {
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

  themes() {
    return lore.listThemes();
  },

  actTypes() {
    return ["ready", "submit"];
  },

  onStart(room) {
    if (!room.channels.public) room.channels.public = [];
    if (!room.meta) room.meta = {};
    if (!room.meta.selectedTheme) room.meta.selectedTheme = lore.DEFAULT_THEME;
  },

  onJoin(_room, _player) {},

  onReset(room) {
    if (!room.channels.public) room.channels.public = [];
    if (!room.meta) room.meta = {};
    room.meta.theme = null;
    room.meta.themeLabel = null;
    room.meta.selectedTheme = lore.DEFAULT_THEME;
    room.meta.cityPoints = 0;
    room.meta.slowdown = null;
    room.meta.crisisPrompt = null;
    room.meta.crisisIndex = 0;
    room.meta.personalitySeed = null;
    room.meta.started = false;
  },

  onStartGame(room) {
    const pack = lore.getPack(room.meta?.selectedTheme || lore.DEFAULT_THEME);
    const players = [...room.players.values()];
    const dealt = pack.deal(players.length);
    const personalitySeed = randomUUID();
    players.forEach((player, i) => {
      const entry = dealt[i];
      if (!player.meta) player.meta = {};
      if (!player.meta.lobbyName) player.meta.lobbyName = player.name;
      player.name = entry.name;
      player.meta.persona = entry.persona;
      player.meta.loreTheme = pack.theme;
      if (player.kind === "bot") {
        player.meta.personality = rollPersonality(`${personalitySeed}:${player.id}`);
      } else {
        delete player.meta.personality;
      }
    });
    if (!room.meta) room.meta = {};
    room.meta.theme = pack.theme;
    room.meta.themeLabel = pack.themeLabel;
    room.meta.selectedTheme = pack.theme;
    room.meta.cityPoints = 0;
    room.meta.slowdown = null;
    room.meta.crisisPrompt = null;
    room.meta.crisisIndex = 0;
    room.meta.personalitySeed = personalitySeed;
    room.meta.started = true;
  },

  lobbySummary(room) {
    const pairIds = new Set();
    for (const p of room.players.values()) {
      if (p.meta?.pairId) pairIds.add(p.meta.pairId);
    }
    const selectedId = room.meta?.selectedTheme || lore.DEFAULT_THEME;
    const pack = lore.getPack(selectedId);
    return {
      pairs: pairIds.size,
      seats: room.players.size,
      theme: room.meta?.themeLabel || null,
      selectedTheme: selectedId,
      selectedThemeLabel: pack.themeLabel,
      themes: lore.listThemes(),
      started: Boolean(room.meta?.started),
    };
  },

  viewMeta(room) {
    return {
      cityPoints: Number(room.meta?.cityPoints) || 0,
      slowdown: room.meta?.slowdown ?? null,
      crisisPrompt: room.meta?.crisisPrompt ?? null,
    };
  },

  onPhaseChange(room, _prev, next) {
    if (next !== "crisis") return;
    if (!room.meta) room.meta = {};
    const idx = Number(room.meta.crisisIndex) || 0;
    const prompt = CRISIS_PROMPTS[idx % CRISIS_PROMPTS.length];
    room.meta.crisisIndex = idx + 1;
    room.meta.crisisPrompt = prompt;
    pushTown(room, `CRISIS: ${prompt}`);
  },

  async onCloseWindow(room, revealed) {
    if (room.phase !== "crisis") return;
    if (!room.meta) room.meta = {};
    const living = livingPlayers(room);
    const answers = (revealed || []).map((r) => ({
      name: r.name,
      text: r.text,
    }));
    const result = await (town._judge || judge)({
      prompt: room.meta.crisisPrompt || "",
      answers,
      livingCount: living.length,
    });
    room.meta.cityPoints = (Number(room.meta.cityPoints) || 0) + (result.pointsDelta || 0);
    room.meta.slowdown = result.slowdown;
    const pts = room.meta.cityPoints;
    const slow =
      result.slowdown === "favor"
        ? " Tempo leans toward the city."
        : result.slowdown === "against"
          ? " Tempo leans against the city."
          : "";
    pushTown(room, `${result.summary} City points: ${pts}.${slow}`);
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
    if (type === "submit") {
      return (
        Boolean(room.window) &&
        (room.phase === "talk" || room.phase === "crisis")
      );
    }
    return false;
  },

  canAdmin(player, type, room) {
    if (!player.host) return false;
    // Demo override: pack 1 human + many bots from lobby ADD BOT.
    if (type === "addBot") return room.phase === "lobby";
    if (type === "startGame" || type === "setTheme") return room.phase === "lobby";
    if (type === "openWindow" || type === "closeWindow") {
      return room.phase === "talk" || room.phase === "crisis";
    }
    if (
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
    const flavor = formatForPrompt(player.meta?.personality);
    const base =
      `You are a bot in a town game. Your public name is ${player.name}. ` +
      `Persona: ${persona}. ` +
      (flavor ? `${flavor} ` : "") +
      "Your team (all bots) wins together, including bots who die. Thin the humans. " +
      "Never confess you are a bot or an AI. Do not reveal who else might be a bot.";
    const crisisPrompt = view?.meta?.crisisPrompt;
    if (view?.phase === "crisis" || (view?.window?.open && crisisPrompt)) {
      return (
        base +
        ` Crisis on the table: ${crisisPrompt || "help the town"}. ` +
        "Write ONE short helpful town answer (under 25 words). Stay in character."
      );
    }
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
