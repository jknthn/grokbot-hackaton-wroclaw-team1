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

function votesCast(room) {
  const votes = room.meta?.votes;
  return votes instanceof Map ? votes.size : 0;
}

function startGameMaster(room, opts = {}) {
  const enabled = opts.enabled ?? process.env.GM_AUTO !== "0";
  const windowMs = Number(opts.windowMs || process.env.GM_WINDOW_MS || 45000);
  const voteMs = Number(opts.voteMs || process.env.GM_VOTE_MS || 45000);
  const nightMs = Number(opts.nightMs || process.env.GM_NIGHT_MS || 8000);
  const tickMs = Number(opts.tickMs || process.env.GM_TICK_MS || 1000);

  let busy = false;
  let stopped = false;
  let phaseStartedAt = Date.now();
  let lastPhase = room.phase;
  let windowOpenedForPhase = null;
  let starting = false;

  function markPhase(phase) {
    if (phase !== lastPhase) {
      lastPhase = phase;
      phaseStartedAt = Date.now();
      windowOpenedForPhase = null;
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
        // Re-announce if phase already entered without GM prompt
        room.announce(`DAY: ${prompt}`);
        room.meta.talkPrompt = prompt;
      }
    }
    if (phase === "crisis") {
      if (!room.meta) room.meta = {};
      // crisisPrompt usually set by onPhaseChange; optionally enrich once
      if (room.meta._wantGmCrisis) {
        const prompt = await writeCrisisPrompt(room.meta?.themeLabel, {
          index: room.meta.crisisIndex || 0,
        });
        room.meta.crisisPrompt = prompt;
        room.announce(`CRISIS: ${prompt}`);
        delete room.meta._wantGmCrisis;
      }
    }
    room.systemOpenWindow({ maxLen: 160 });
    windowOpenedForPhase = phase;
    phaseStartedAt = Date.now();
  }

  async function closeAndAdvance(nextPhase) {
    if (room.window) {
      await room.systemCloseWindow({ reveal: true });
    }
    room.systemSetPhase(nextPhase);
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
          const result = room.resolveVote();
          if (!result?.winner) {
            room.systemSetPhase("night");
          }
        }
        return;
      }

      if (room.phase === "night") {
        if (elapsed >= nightMs) {
          room.systemSetPhase("talk");
        }
      }
    } catch (err) {
      console.warn("[gm]", err.message);
    } finally {
      busy = false;
    }
  }

  const unsub = room.onUpdate(() => {
    markPhase(room.phase);
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
