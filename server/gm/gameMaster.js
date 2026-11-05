/**
 * In-process Game Master — code owns phases; LLM fills prompts.
 * Enable with GM_AUTO !== "0" (default on for town).
 */

const lore = require("../lore");
const {
  pickTheme,
  writeTalkPrompt,
  writeCrisisPrompt,
} = require("./narrate");

function livingCount(room) {
  let n = 0;
  for (const p of room.players.values()) {
    if (p.alive) n += 1;
  }
  return n;
}

function livingBots(room) {
  return [...room.players.values()].filter((p) => p.alive && p.kind === "bot");
}

function votesCast(room) {
  const votes = room.meta?.votes;
  return votes instanceof Map ? votes.size : 0;
}

function shadowVotesCast(room) {
  const votes = room.meta?.night?.shadowVotes;
  return votes instanceof Map ? votes.size : 0;
}

function startGameMaster(room, opts = {}) {
  const enabled = opts.enabled ?? process.env.GM_AUTO !== "0";
  const windowMs = Number(opts.windowMs || process.env.GM_WINDOW_MS || 45000);
  const voteMs = Number(opts.voteMs || process.env.GM_VOTE_MS || 45000);
  const nightTalkMs = Number(opts.nightTalkMs || process.env.GM_NIGHT_TALK_MS || 20000);
  const nightVoteMs = Number(opts.nightVoteMs || process.env.GM_NIGHT_VOTE_MS || 20000);
  const nightDefendMs = Number(
    opts.nightDefendMs || process.env.GM_NIGHT_DEFEND_MS || 12000
  );
  const tickMs = Number(opts.tickMs || process.env.GM_TICK_MS || 1000);

  let busy = false;
  let stopped = false;
  let phaseStartedAt = Date.now();
  let stageStartedAt = Date.now();
  let lastPhase = room.phase;
  let lastNightStage = null;
  let windowOpenedForPhase = null;
  let starting = false;

  function markPhase(phase) {
    if (phase !== lastPhase) {
      lastPhase = phase;
      phaseStartedAt = Date.now();
      stageStartedAt = Date.now();
      windowOpenedForPhase = null;
      lastNightStage = room.meta?.night?.stage || null;
    }
  }

  function markNightStage() {
    const stage = room.meta?.night?.stage || null;
    if (stage !== lastNightStage) {
      lastNightStage = stage;
      stageStartedAt = Date.now();
    }
  }

  async function maybeStart() {
    if (room.phase !== "lobby" || starting) return;
    if (!room.allHumansReady()) return;
    starting = true;
    try {
      const themes = lore.listThemes();
      const themeId = await pickTheme(themes);
      const result = room.tryAutoStart(themeId);
      if (result.ok) {
        console.log(`[gm] auto-start theme=${themeId}`);
      }
    } catch (err) {
      console.warn("[gm] start failed:", err.message);
    } finally {
      starting = false;
    }
  }

  async function ensureWindow(phase) {
    if (room.window) return;
    if (windowOpenedForPhase === phase) return;
    if (phase === "talk") {
      if (!room.meta) room.meta = {};
      if (!room.meta.talkPrompt) {
        const prompt = await writeTalkPrompt(room.meta?.themeLabel, {
          index: room.meta.talkIndex || 0,
        });
        room.meta._gmTalkPrompt = prompt;
        room.announce(`DAY: ${prompt}`);
        room.meta.talkPrompt = prompt;
      }
    }
    if (phase === "crisis") {
      if (!room.meta) room.meta = {};
      if (room.meta._wantGmCrisis) {
        const prompt = await writeCrisisPrompt(room.meta?.themeLabel, {
          index: room.meta.crisisIndex || 0,
        });
        room.meta.crisisPrompt = prompt;
        room.announce(`CRISIS: ${prompt}`);
        delete room.meta._wantGmCrisis;
      }
    }
    if (phase === "talk") {
      room.announce(
        "Write window OPEN — one sealed day line. Submit, then wait for the reveal."
      );
    } else if (phase === "crisis") {
      room.announce(
        "Crisis window OPEN — one sealed answer. Submit, then the town judges."
      );
    }
    room.systemOpenWindow({ maxLen: 160 });
    windowOpenedForPhase = phase;
    phaseStartedAt = Date.now();
  }

  async function closeAndAdvance(nextPhase) {
    if (room.window) {
      await room.systemCloseWindow({ reveal: true });
    }
    if (nextPhase === "crisis") {
      room.announce("Moving to CRISIS.");
    } else if (nextPhase === "vote") {
      room.announce("Moving to VOTE — click a seat.");
    }
    room.systemSetPhase(nextPhase);
  }

  function finishNightToTalkOrEnd(result) {
    if (result?.winner) return;
    room.announce("Dawn. Another day begins.");
    room.systemSetPhase("talk");
  }

  async function tickNight() {
    markNightStage();
    const stage = room.meta?.night?.stage || "talk";
    const elapsed = Date.now() - stageStartedAt;
    const bots = livingBots(room);

    if (stage === "talk") {
      if (elapsed >= nightTalkMs) {
        room.announce("Shadow talk ends — strike votes.");
        room.setNightStage("vote");
      }
      return;
    }

    if (stage === "vote") {
      const cast = shadowVotesCast(room);
      if ((bots.length > 0 && cast >= bots.length) || elapsed >= nightVoteMs) {
        const tallied = room.tallyShadowVotes();
        if (tallied.target == null) {
          room.announce("No shadow majority — resolving a quiet night.");
          const result = room.resolveNight();
          finishNightToTalkOrEnd(result);
          return;
        }
        const pts = Number(room.meta.cityPoints) || 0;
        if (pts >= 1) {
          room.announce("A strike is locked. City may spend 1 point to block.");
          room.setNightStage("defend");
        } else {
          room.announce("Strike locked — no city points to spend.");
          const result = room.resolveNight();
          finishNightToTalkOrEnd(result);
        }
      }
      return;
    }

    if (stage === "defend") {
      if (room.meta?.night?.blocked || elapsed >= nightDefendMs) {
        const result = room.resolveNight();
        finishNightToTalkOrEnd(result);
      }
    }
  }

  async function tick() {
    if (stopped || busy || !enabled) return;
    busy = true;
    try {
      markPhase(room.phase);
      const elapsed = Date.now() - phaseStartedAt;
      const living = livingCount(room);

      if (room.phase === "lobby") {
        await maybeStart();
        return;
      }

      if (room.phase === "talk") {
        await ensureWindow("talk");
        const submitted = room.window?.drafts?.size || 0;
        if ((living > 0 && submitted >= living) || elapsed >= windowMs) {
          await closeAndAdvance("crisis");
        }
        return;
      }

      if (room.phase === "crisis") {
        await ensureWindow("crisis");
        const submitted = room.window?.drafts?.size || 0;
        if ((living > 0 && submitted >= living) || elapsed >= windowMs) {
          await closeAndAdvance("vote");
        }
        return;
      }

      if (room.phase === "vote") {
        const cast = votesCast(room);
        if ((living > 0 && cast >= living) || elapsed >= voteMs) {
          room.announce(
            cast >= living
              ? "All votes are in — resolving."
              : "Vote window closed — resolving."
          );
          const result = room.resolveVote();
          if (!result?.winner) {
            room.announce("No winner yet — night falls.");
            room.systemSetPhase("night");
          }
        }
        return;
      }

      if (room.phase === "night") {
        await tickNight();
      }
    } catch (err) {
      console.warn("[gm]", err.message);
    } finally {
      busy = false;
    }
  }

  const unsub = room.onUpdate(() => {
    markPhase(room.phase);
    markNightStage();
  });
  const timer = setInterval(tick, tickMs);
  setTimeout(tick, 200);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      unsub();
    },
    tick,
  };
}

module.exports = { startGameMaster };
