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

function livingBots(room) {
  return livingPlayers(room).filter((p) => p.kind === "bot");
}

function livingHumans(room) {
  return livingPlayers(room).filter((p) => p.kind === "human");
}

function ensureVotes(room) {
  if (!room.meta) room.meta = {};
  if (!(room.meta.votes instanceof Map)) {
    room.meta.votes = new Map();
  }
  return room.meta.votes;
}

function ensureShadowVotes(room) {
  if (!room.meta) room.meta = {};
  if (!room.meta.night) room.meta.night = {};
  if (!(room.meta.night.shadowVotes instanceof Map)) {
    room.meta.night.shadowVotes = new Map();
  }
  return room.meta.night.shadowVotes;
}

function clearShadowLabels(room) {
  for (const p of room.players.values()) {
    if (p.meta) delete p.meta.shadowLabel;
  }
}

function assignShadowLabels(room) {
  clearShadowLabels(room);
  const bots = livingBots(room);
  const letters = bots.map((_, i) => String.fromCharCode(65 + i)); // A,B,C…
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  bots.forEach((bot, i) => {
    if (!bot.meta) bot.meta = {};
    bot.meta.shadowLabel = `Shadow ${letters[i]}`;
  });
}

function beginNight(room) {
  if (!room.channels.shadow) room.channels.shadow = [];
  else room.channels.shadow = [];
  assignShadowLabels(room);
  room.meta.night = {
    stage: "talk",
    shadowVotes: new Map(),
    pendingTargetSeat: null,
    blocked: false,
  };
  const nShadows = livingBots(room).length;
  pushTown(
    room,
    `NIGHT. Humans wait in the dark. ${nShadows} shadow(s) meet in secret — labels reshuffled.`,
    {
      action: "NIGHT — WAIT",
      detail: "Humans: wait. Spend city points later if a strike is coming.",
    }
  );
}

function setNightStage(room, stage) {
  if (!room.meta.night) room.meta.night = {};
  room.meta.night.stage = stage;
  if (stage === "vote") {
    room.meta.night.shadowVotes = new Map();
    room.meta.night.pendingTargetSeat = null;
    room.meta.night.blocked = false;
    const humans = livingHumans(room);
    const list = humans.map((h) => `#${h.seatId} ${h.name}`).join(", ");
    pushTown(
      room,
      "Shadows cast their strike votes (humans only — or pass).",
      null
    );
    // Humans still only see wait guide; bots get meta via viewMeta
    setGuide(
      room,
      "NIGHT — WAIT",
      "Shadows are choosing. Hold steady."
    );
    room.meta.night._humanTargetsHint = list;
  } else if (stage === "defend") {
    const pts = Number(room.meta.cityPoints) || 0;
    if (pts >= 1) {
      setGuide(
        room,
        "NIGHT — BLOCK?",
        `City has ${pts} point(s). Humans: spend 1 to block the strike (reads as a quiet night).`
      );
      pushTown(
        room,
        `A strike is forming. City may spend 1 point to block it (${pts} available).`,
        null
      );
    } else {
      setGuide(room, "NIGHT — WAIT", "No city points to spend. Strike resolves.");
    }
  } else if (stage === "talk") {
    setGuide(
      room,
      "NIGHT — WAIT",
      "Shadows are whispering. Humans cannot hear them."
    );
  }
}

function tallyShadowVotes(room) {
  const shadows = livingBots(room);
  const humans = livingHumans(room);
  const votes = ensureShadowVotes(room);
  const humanSeats = new Set(humans.map((h) => h.seatId));
  const tallies = new Map();
  let cast = 0;
  let passes = 0;
  for (const bot of shadows) {
    if (!votes.has(bot.seatId)) continue;
    cast += 1;
    const target = votes.get(bot.seatId);
    if (target == null) {
      passes += 1;
      continue;
    }
    if (!humanSeats.has(target)) continue;
    tallies.set(target, (tallies.get(target) || 0) + 1);
  }
  // Demo balance: with a single living human, require unanimous shadow strikes
  // (any PASS or split → quiet). Otherwise normal majority of living shadows.
  const need =
    humans.length <= 1
      ? Math.max(1, shadows.length)
      : Math.floor(shadows.length / 2) + 1;
  let bestSeat = null;
  let bestCount = 0;
  for (const [seatId, count] of tallies.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestSeat = seatId;
    }
  }
  if (bestSeat == null || bestCount < need) {
    room.meta.night.pendingTargetSeat = null;
    return { target: null, bestCount, need, cast, passes, unanimous: humans.length <= 1 };
  }
  room.meta.night.pendingTargetSeat = bestSeat;
  return { target: bestSeat, bestCount, need, cast, passes, unanimous: humans.length <= 1 };
}

function resolveNight(room) {
  if (!room.meta.night) room.meta.night = { stage: "done" };
  const pending = room.meta.night.pendingTargetSeat;
  const blocked = Boolean(room.meta.night.blocked);
  clearShadowLabels(room);
  room.meta.night.stage = "done";

  if (pending == null || blocked) {
    pushTown(
      room,
      blocked
        ? "Quiet night. The city watch held (1 city point spent)."
        : "Quiet night. The shadows found no majority.",
      {
        action: "QUIET NIGHT",
        detail: "Dawn comes. No one vanished.",
      }
    );
    room.meta.night.pendingTargetSeat = null;
    room.meta.night.blocked = false;
    return { killed: null, winner: checkWin(room), blocked };
  }

  const target = livingPlayers(room).find((p) => p.seatId === pending);
  if (!target) {
    pushTown(room, "Quiet night. The target was already gone.", {
      action: "QUIET NIGHT",
      detail: "Dawn comes.",
    });
    return { killed: null, winner: checkWin(room), blocked: false };
  }
  target.alive = false;
  pushTown(room, `${target.name} vanished in the night.`, {
    action: "VANISHED",
    detail: `${target.name} is gone. Kind stays hidden.`,
  });
  room.meta.night.pendingTargetSeat = null;
  return { killed: target, winner: checkWin(room), blocked: false };
}

function setGuide(room, action, detail) {
  if (!room.meta) room.meta = {};
  room.meta.guide = {
    action: String(action || "").slice(0, 48),
    detail: String(detail || "").slice(0, 200),
    at: Date.now(),
  };
}

function pushTown(room, text, guide) {
  if (!room.channels.public) room.channels.public = [];
  const body = String(text ?? "").trim().slice(0, 280);
  if (!body) return;
  room.channels.public.push({
    fromSeat: -1,
    name: "Town",
    text: body,
    ts: Date.now(),
  });
  if (guide?.action) {
    setGuide(room, guide.action, guide.detail || body);
  }
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
    pushTown(
      room,
      `Vote fails — need ${need} of ${livingCount}. Nobody leaves. Night is next.`,
      {
        action: "NO MAJORITY",
        detail: "The table could not agree. Night comes next.",
      }
    );
    room.meta.votes = new Map();
    return { removed: null, winner: null };
  }

  const target = living.find((p) => p.seatId === bestSeat);
  if (target) {
    target.alive = false;
    pushTown(
      room,
      `${target.name} is voted out (${bestCount}/${livingCount}). Kind stays hidden. Checking the town…`,
      {
        action: "VOTED OUT",
        detail: `${target.name} leaves the table. Roles stay hidden.`,
      }
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
    return ["ready", "submit", "vote", "shadowVote", "blockNight"];
  },

  onStart(room) {
    if (!room.channels.public) room.channels.public = [];
    if (!room.meta) room.meta = {};
    if (!room.meta.selectedTheme) room.meta.selectedTheme = lore.DEFAULT_THEME;
    setGuide(
      room,
      "LOBBY",
      "Host: ADD BOT to pack the table. Humans: press READY when packed."
    );
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
    room.meta.night = null;
    if (room.channels) room.channels.shadow = [];
    clearShadowLabels(room);
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
    room.meta.night = null;
    if (!room.channels.shadow) room.channels.shadow = [];
    else room.channels.shadow = [];
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
    const publicMsgs = room.channels?.public || [];
    const lastTown = [...publicMsgs].reverse().find((m) => m.name === "Town");
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
      guide: room.meta?.guide || null,
      lastTown: lastTown ? lastTown.text : null,
      livingCount: living.length,
      nightStage: room.meta?.night?.stage || null,
      shadowLabel: player?.meta?.shadowLabel || null,
      canBlockNight:
        room.phase === "night" &&
        room.meta?.night?.stage === "defend" &&
        player?.kind === "human" &&
        player?.alive &&
        (Number(room.meta?.cityPoints) || 0) >= 1 &&
        !room.meta?.night?.blocked,
      shadowVotesCast:
        room.meta?.night?.shadowVotes instanceof Map
          ? room.meta.night.shadowVotes.size
          : 0,
      shadowVotesNeeded: livingBots(room).length,
      youShadowVoted:
        room.meta?.night?.shadowVotes instanceof Map && player
          ? room.meta.night.shadowVotes.has(player.seatId)
          : false,
      // Night only: shadows are told which seats are valid human targets (locked loop).
      humanTargets:
        player?.kind === "bot" &&
        room.phase === "night" &&
        room.meta?.night?.stage === "vote"
          ? livingHumans(room).map((h) => ({
              seatId: h.seatId,
              name: h.name,
            }))
          : null,
    };
  },

  onPhaseChange(room, prev, next) {
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
      pushTown(
        room,
        `CRISIS hits the town. Answer in the sealed window — one line each. Question: ${room.meta.crisisPrompt}`,
        {
          action: "CRISIS — SUBMIT",
          detail: room.meta.crisisPrompt,
        }
      );
      return;
    }
    if (next === "talk") {
      clearShadowLabels(room);
      if (room.meta._gmTalkPrompt) {
        room.meta.talkPrompt = room.meta._gmTalkPrompt;
        delete room.meta._gmTalkPrompt;
      } else {
        const idx = Number(room.meta.talkIndex) || 0;
        room.meta.talkPrompt = TALK_PROMPTS[idx % TALK_PROMPTS.length];
        room.meta.talkIndex = idx + 1;
      }
      const dayN = Number(room.meta.talkIndex) || 1;
      pushTown(
        room,
        `DAY ${dayN}. Blind talk — write one sealed line, then we reveal together. Prompt: ${room.meta.talkPrompt}`,
        {
          action: "DAY TALK — SUBMIT",
          detail: room.meta.talkPrompt,
        }
      );
      room.meta.votes = new Map();
      room.meta.night = null;
      return;
    }
    if (next === "vote") {
      room.meta.votes = new Map();
      const living = livingPlayers(room).length;
      const need = Math.floor(living / 2) + 1;
      pushTown(
        room,
        `VOTE. Click one living seat. Need ${need} of ${living} for a kick. Kind stays hidden — judge the words, not a label.`,
        {
          action: "VOTE — CLICK A SEAT",
          detail: `Majority is ${need}/${living}. Roles stay hidden.`,
        }
      );
      return;
    }
    if (next === "night") {
      room.meta.votes = new Map();
      beginNight(room);
      return;
    }
    if (next === "lobby") {
      setGuide(
        room,
        "LOBBY",
        "Host: ADD BOT to pack the table. Humans: press READY when packed."
      );
      return;
    }
    if (next === "ended") {
      const w = room.meta.winner;
      if (w === "humans") {
        pushTown(
          room,
          "ENDED — humans win. No bots remain at the table.",
          { action: "HUMANS WIN", detail: "Reset game or clear table for another sit-down." }
        );
      } else if (w === "bots") {
        pushTown(
          room,
          "ENDED — bots win as a team (dead bots share it). Living humans could not outnumber them.",
          { action: "BOTS WIN", detail: "Reset game or clear table for another sit-down." }
        );
      } else {
        pushTown(room, "ENDED.", { action: "ENDED", detail: "Round over." });
      }
      return;
    }
    if (prev && next) {
      setGuide(room, String(next).toUpperCase(), `Phase moved to ${next}.`);
    }
  },

  async onCloseWindow(room, revealed) {
    if (!room.meta) room.meta = {};
    const n = (revealed || []).length;
    if (room.phase === "talk") {
      pushTown(
        room,
        `Reveal: ${n} sealed day line(s) hit the record. Crisis is next.`,
        {
          action: "DAY REVEALED",
          detail: "Read the chat, then answer the crisis.",
        }
      );
      return;
    }
    if (room.phase !== "crisis") return;
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
    // Demo balance: always leave at least 1 point so a night block is possible.
    let watchFund = false;
    if ((Number(room.meta.cityPoints) || 0) < 1 && n > 0) {
      room.meta.cityPoints = 1;
      watchFund = true;
    }
    const pts = room.meta.cityPoints;
    const slow =
      result.slowdown === "favor"
        ? " Tempo leans toward the city."
        : result.slowdown === "against"
          ? " Tempo leans against the city."
          : "";
    const fund = watchFund ? " Watch fund grants 1 city point." : "";
    pushTown(
      room,
      `Crisis judged (${n} answers). ${result.summary} City points: ${pts}.${slow}${fund} Vote is next.`,
      {
        action: "CRISIS RESOLVED",
        detail: `City points ${pts}. You can spend 1 at night to block a strike.`,
      }
    );
  },

  canSay(player, channel, room) {
    if (!player.alive) return false;
    if (room.window) return false;
    if (channel === "shadow") {
      return (
        room.phase === "night" &&
        player.kind === "bot" &&
        room.meta?.night?.stage === "talk"
      );
    }
    // Public scoring talk is window-only under GM loop.
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
    if (type === "shadowVote") {
      if (room.phase !== "night") return false;
      if (player.kind !== "bot") return false;
      if (room.meta?.night?.stage !== "vote") return false;
      const votes = room.meta?.night?.shadowVotes;
      if (votes instanceof Map && votes.has(player.seatId)) return false;
      return true;
    }
    if (type === "blockNight") {
      if (room.phase !== "night") return false;
      if (player.kind !== "human") return false;
      if (room.meta?.night?.stage !== "defend") return false;
      if (room.meta?.night?.blocked) return false;
      return (Number(room.meta?.cityPoints) || 0) >= 1;
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

  visibleChannels(player, room) {
    if (
      room.phase === "night" &&
      player.kind === "bot" &&
      player.alive
    ) {
      return ["public", "shadow"];
    }
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
    if (type === "shadowVote") {
      const votes = ensureShadowVotes(room);
      if (votes.has(player.seatId)) {
        return { ok: false, error: "already voted" };
      }
      const pass = payload?.pass === true || payload?.seatId == null;
      if (pass) {
        votes.set(player.seatId, null);
        return { ok: true, pass: true };
      }
      const targetSeat = Number(payload.seatId);
      const human = livingHumans(room).find((h) => h.seatId === targetSeat);
      if (!human) return { ok: false, error: "humans only" };
      votes.set(player.seatId, targetSeat);
      return { ok: true, targetSeat };
    }
    if (type === "blockNight") {
      const pts = Number(room.meta.cityPoints) || 0;
      if (pts < 1) return { ok: false, error: "no points" };
      if (!room.meta.night) return { ok: false, error: "no night" };
      if (room.meta.night.blocked) return { ok: false, error: "already blocked" };
      room.meta.cityPoints = pts - 1;
      room.meta.night.blocked = true;
      pushTown(
        room,
        `The city spends 1 point on a watch (${room.meta.cityPoints} left).`,
        {
          action: "BLOCK SPENT",
          detail: "If a strike was coming, it should fail quietly.",
        }
      );
      return { ok: true, cityPoints: room.meta.cityPoints };
    }
    return { ok: false, error: "unknown act" };
  },

  botPrompt(player, view) {
    const persona = player.meta?.persona || "A townsfolk with a careful tongue.";
    const flavor = formatForPrompt(player.meta?.personality);
    const label = player.meta?.shadowLabel || view?.meta?.shadowLabel;
    const base =
      `You are a bot in a town game. Your public name is ${player.name}. ` +
      `Persona: ${persona}. ` +
      (flavor ? `${flavor} ` : "") +
      "Your team (all bots) wins together, including bots who die. Blend in by day. " +
      "Never confess you are a bot or an AI. Do not reveal who else might be a bot.";
    if (view?.phase === "night" && view?.meta?.nightStage === "talk") {
      return (
        base +
        ` Night shadow channel: you are ${label || "a shadow"} tonight (label reshuffles). ` +
        "Other shadows do not share stable identities. Cooperate in ONE short line. Never use your lore name here. " +
        "If the table is thin on humans, prefer caution over a loud strike."
      );
    }
    if (view?.phase === "night" && view?.meta?.nightStage === "vote") {
      const targets = view?.meta?.humanTargets || [];
      const list = targets.map((h) => `#${h.seatId} ${h.name}`).join(", ");
      const caution =
        targets.length <= 1
          ? "Only one human target exists — prefer PASS unless the shadow chat strongly agrees. Unanimous strike is required."
          : "Strike only with clear shadow agreement; otherwise PASS.";
      return (
        base +
        ` You are ${label || "a shadow"}. Vote to strike ONE living human seat, or PASS. ` +
        `${caution} Valid human targets: ${list || "none"}. Reply with seat number or PASS.`
      );
    }
    if (view?.phase === "vote") {
      const seats = (view.seats || [])
        .filter((s) => s.alive && s.seatId !== player.seatId)
        .map((s) => `#${s.seatId} ${s.name}`)
        .join(", ");
      return (
        base +
        " Day vote: pick ONE living seat from suspicious public speech only. " +
        "Do not try to detect who is human vs bot. Do not pile onto the same seat every round. " +
        `Candidates: ${seats || "none"}. Reply with only the seat number.`
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
  beginNight,
  setNightStage,
  tallyShadowVotes,
  resolveNight,
  pushTown,
  TALK_PROMPTS,
  CRISIS_PROMPTS,
};

module.exports = town;
