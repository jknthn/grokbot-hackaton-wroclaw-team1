/** TownRules — locked loop v1 (setup + crisis + vote + GM-friendly hooks). */

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

const TALK_PROMPTS = [
  "Name one ally and why you trust them — one short line.",
  "What rumor worries you most before night?",
  "Who at this table is hiding something?",
];

function livingPlayers(room) {
  return [...room.players.values()].filter((p) => p.alive);
}

function ensureVotes(room) {
  if (!room.meta) room.meta = {};
  if (!(room.meta.votes instanceof Map)) {
    room.meta.votes = new Map();
  }
  return room.meta.votes;
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

function checkWin(room) {
  const living = livingPlayers(room);
  const humans = living.filter((p) => p.kind === "human").length;
  const bots = living.filter((p) => p.kind === "bot").length;
  if (bots === 0) return "humans";
  if (humans <= bots) return "bots";
  return null;
}

function resolveVotes(room) {
  const living = livingPlayers(room);
  const livingCount = living.length;
  const votes = ensureVotes(room);
  const livingSeats = new Set(living.map((p) => p.seatId));
  const tallies = new Map();

  for (const [fromSeat, targetSeat] of votes.entries()) {
    if (!livingSeats.has(fromSeat)) continue;
    if (!livingSeats.has(targetSeat)) continue;
    tallies.set(targetSeat, (tallies.get(targetSeat) || 0) + 1);
  }

  let bestSeat = null;
  let bestCount = 0;
  for (const [seatId, count] of tallies.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestSeat = seatId;
    }
  }

  const need = Math.floor(livingCount / 2) + 1;
  if (bestSeat == null || bestCount < need) {
    pushTown(room, "No majority. Nobody is removed.");
    room.meta.votes = new Map();
    return { removed: null, winner: null };
  }

  const target = living.find((p) => p.seatId === bestSeat);
  if (target) {
    target.alive = false;
    pushTown(
      room,
      `${target.name} is voted out. Their kind stays hidden.`
    );
  }
  room.meta.votes = new Map();
  return { removed: target || null, winner: checkWin(room) };
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
    return ["ready", "submit", "vote"];
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
    room.meta.talkIndex = 0;
    room.meta.personalitySeed = null;
    room.meta.started = false;
    room.meta.votes = new Map();
    room.meta.winner = null;
    for (const p of room.players.values()) {
      if (p.meta) {
        p.meta.ready = false;
        delete p.meta.personality;
      }
    }
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
      player.meta.ready = false;
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
    room.meta.talkIndex = 0;
    room.meta.personalitySeed = personalitySeed;
    room.meta.started = true;
    room.meta.votes = new Map();
    room.meta.winner = null;
  },

  lobbySummary(room) {
    const pairIds = new Set();
    const humans = [];
    for (const p of room.players.values()) {
      if (p.meta?.pairId) pairIds.add(p.meta.pairId);
      if (p.kind === "human") humans.push(p);
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
      humanCount: humans.length,
      readyHumans: humans.filter((p) => p.meta?.ready).length,
    };
  },

  viewMeta(room, player) {
    const living = livingPlayers(room);
    const votes = room.meta?.votes instanceof Map ? room.meta.votes : null;
    const yourVote = votes && player ? votes.get(player.seatId) : undefined;
    return {
      cityPoints: Number(room.meta?.cityPoints) || 0,
      slowdown: room.meta?.slowdown ?? null,
      crisisPrompt: room.meta?.crisisPrompt ?? null,
      talkPrompt: room.meta?.talkPrompt ?? null,
      winner: room.meta?.winner ?? null,
      votesCast: votes ? votes.size : 0,
      votesNeeded: living.length,
      youVoted: yourVote !== undefined,
      yourVoteTarget: yourVote !== undefined ? yourVote : null,
    };
  },

  onPhaseChange(room, _prev, next) {
    if (!room.meta) room.meta = {};
    if (next === "crisis") {
      if (room.meta._gmCrisisPrompt) {
        room.meta.crisisPrompt = room.meta._gmCrisisPrompt;
        delete room.meta._gmCrisisPrompt;
      } else {
        const idx = Number(room.meta.crisisIndex) || 0;
        room.meta.crisisPrompt = CRISIS_PROMPTS[idx % CRISIS_PROMPTS.length];
        room.meta.crisisIndex = idx + 1;
      }
      pushTown(room, `CRISIS: ${room.meta.crisisPrompt}`);
      return;
    }
    if (next === "talk") {
      if (room.meta._gmTalkPrompt) {
        room.meta.talkPrompt = room.meta._gmTalkPrompt;
        delete room.meta._gmTalkPrompt;
      } else {
        const idx = Number(room.meta.talkIndex) || 0;
        room.meta.talkPrompt = TALK_PROMPTS[idx % TALK_PROMPTS.length];
        room.meta.talkIndex = idx + 1;
      }
      if (room.meta.talkPrompt) {
        pushTown(room, `DAY: ${room.meta.talkPrompt}`);
      }
      room.meta.votes = new Map();
      return;
    }
    if (next === "vote") {
      room.meta.votes = new Map();
      pushTown(
        room,
        "VOTE: Click a living seat. Majority of the living decides. Kind stays hidden."
      );
      return;
    }
    if (next === "night") {
      room.meta.votes = new Map();
      pushTown(room, "Night falls. Shadows stir — for now, the night passes quietly.");
      return;
    }
    if (next === "ended") {
      const w = room.meta.winner;
      if (w === "humans") {
        pushTown(room, "The town holds. Humans win — no bots remain.");
      } else if (w === "bots") {
        pushTown(room, "The shadows win as a team. Dead bots share the victory.");
      }
    }
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

  canSay(_player, _channel, _room) {
    // Scoring talk is window-only under GM loop.
    return false;
  },

  canAct(player, type, room) {
    if (!player.alive) return false;
    if (type === "ready") {
      return room.phase === "lobby" && player.kind === "human" && !player.meta?.ready;
    }
    if (type === "submit") {
      return (
        Boolean(room.window) &&
        (room.phase === "talk" || room.phase === "crisis")
      );
    }
    if (type === "vote") {
      if (room.phase !== "vote") return false;
      const votes = room.meta?.votes;
      if (votes instanceof Map && votes.has(player.seatId)) return false;
      return true;
    }
    return false;
  },

  canAdmin(player, type, room) {
    if (!player.host) return false;
    if (type === "addBot") return room.phase === "lobby";
    if (type === "startGame" || type === "setTheme") return room.phase === "lobby";
    if (type === "openWindow" || type === "closeWindow") {
      return room.phase === "talk" || room.phase === "crisis";
    }
    if (type === "setAlive") {
      return room.phase !== "vote" && room.phase !== "ended";
    }
    if (type === "resetGame" || type === "resetRoom") {
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

  onAct(room, player, type, payload) {
    if (type === "ready") {
      if (!player.meta) player.meta = {};
      player.meta.ready = true;
      return { ok: true };
    }
    if (type === "submit") return { ok: false, error: "use submit socket" };
    if (type === "vote") {
      const targetSeat = Number(payload?.seatId);
      if (!Number.isFinite(targetSeat)) {
        return { ok: false, error: "seat required" };
      }
      const living = livingPlayers(room);
      const target = living.find((p) => p.seatId === targetSeat);
      if (!target) return { ok: false, error: "invalid target" };
      const votes = ensureVotes(room);
      if (votes.has(player.seatId)) {
        return { ok: false, error: "already voted" };
      }
      votes.set(player.seatId, targetSeat);
      return { ok: true, targetSeat };
    }
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
    if (view?.phase === "vote") {
      const seats = (view.seats || [])
        .filter((s) => s.alive && s.seatId !== player.seatId)
        .map((s) => `#${s.seatId} ${s.name}`)
        .join(", ");
      return (
        base +
        ` Vote phase: pick ONE living seat to eliminate. Candidates: ${seats || "none"}. ` +
        "Reply with only the seat number."
      );
    }
    const crisisPrompt = view?.meta?.crisisPrompt;
    if (view?.phase === "crisis" || (view?.window?.open && crisisPrompt)) {
      return (
        base +
        ` Crisis on the table: ${crisisPrompt || "help the town"}. ` +
        "Write ONE short helpful town answer (under 25 words). Stay in character."
      );
    }
    const talkPrompt = view?.meta?.talkPrompt;
    if (view?.window?.open) {
      return (
        base +
        (talkPrompt ? ` Prompt: ${talkPrompt}. ` : " ") +
        "A blind write window is open: write ONE short in-character line (under 20 words)."
      );
    }
    return base + " Wait for the next window.";
  },

  checkWin,
  resolveVotes,
  pushTown,
  TALK_PROMPTS,
  CRISIS_PROMPTS,
};

module.exports = town;
