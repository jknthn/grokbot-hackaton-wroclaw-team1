(() => {
  const SESSION_KEY = "grokmafia.session";
  const socket = io();

  const joinScreen = document.getElementById("join-screen");
  const game = document.getElementById("game");
  const joinBtn = document.getElementById("join-btn");
  const joinError = document.getElementById("join-error");
  const gameError = document.getElementById("game-error");
  const phaseLabel = document.getElementById("phase-label");
  const cityPoints = document.getElementById("city-points");
  const winGoal = document.getElementById("win-goal");
  const sideLabel = document.getElementById("side-label");
  const youLabel = document.getElementById("you-label");
  const shadowBanner = document.getElementById("shadow-banner");
  const shadowStatus = document.getElementById("shadow-status");
  const shadowCount = document.getElementById("shadow-count");
  const shadowChat = document.getElementById("shadow-chat");
  const blockNightBtn = document.getElementById("block-night-btn");
  const hostControls = document.getElementById("host-controls");
  const phaseButtons = document.getElementById("phase-buttons");
  const startGameBtn = document.getElementById("start-game-btn");
  const themeButtons = document.getElementById("theme-buttons");
  const openWindowBtn = document.getElementById("open-window-btn");
  const closeWindowBtn = document.getElementById("close-window-btn");
  const addBotBtn = document.getElementById("add-bot-btn");
  const resetGameBtn = document.getElementById("reset-game-btn");
  const resetRoomBtn = document.getElementById("reset-room-btn");
  const lobbyStatus = document.getElementById("lobby-status");
  const canvas = document.getElementById("scene");
  const fallbackEl = document.getElementById("webgl-fallback");
  const fallbackMsg = document.getElementById("webgl-fallback-msg");
  const seatFallback = document.getElementById("seat-fallback");
  const chatWrap = document.getElementById("chat-wrap");
  const chat = document.getElementById("chat");
  const sayForm = document.getElementById("say-form");
  const sayInput = document.getElementById("say-input");
  const submitForm = document.getElementById("submit-form");
  const submitInput = document.getElementById("submit-input");
  const yourDraft = document.getElementById("your-draft");
  const windowBanner = document.getElementById("window-banner");
  const windowStatus = document.getElementById("window-status");
  const windowCount = document.getElementById("window-count");
  const voteBanner = document.getElementById("vote-banner");
  const voteStatus = document.getElementById("vote-status");
  const voteCount = document.getElementById("vote-count");
  const nowAction = document.getElementById("now-action");
  const nowDetail = document.getElementById("now-detail");
  const nightVeil = document.getElementById("night-veil");
  const readyBtn = document.getElementById("ready-btn");

  let view = null;
  let lastPhase = null;
  let selectedSeatId = null;
  let resumeAttempted = false;
  /** @type {Map<number, boolean>} */
  let prevAlive = new Map();
  /** @type {Set<number>} */
  let vanishSeats = new Set();
  /** @type {Map<number, string>} */
  let evidenceChips = new Map();
  let lastPublicLen = 0;
  let sceneState = "loading";
  let sceneApi = {
    available: false,
    sync() {},
    debug() {
      return { available: false, seatCount: 0, seats: [] };
    },
    projectSeat() {
      return null;
    },
    destroy() {},
  };

  function evidenceFromText(text, seats) {
    const t = String(text || "");
    const lower = t.toLowerCase();
    const named = seats.find(
      (s) =>
        s.name &&
        t.toLowerCase().includes(String(s.name).toLowerCase().split(/\s+/)[0])
    );
    if (named) return `named ${shortName(named.name)}`;
    if (/\b(liar|suspicious|hiding|guilty|shadow|fake)\b/i.test(lower)) {
      return "accused";
    }
    if (/\b(trust|ally|with me|innocent|solid)\b/i.test(lower)) return "allied";
    if (/\b(maybe|perhaps|unsure|think|guess|might)\b/i.test(lower)) {
      return "hedged";
    }
    if (t.trim().length >= 40) return "long take";
    if (t.trim().length > 0) return "on record";
    return "";
  }

  function refreshEvidence(msgs, seats) {
    // Use the latest attributed public lines (skip Town).
    const recent = [...msgs].reverse().filter((m) => m.fromSeat >= 0).slice(0, 12);
    const next = new Map();
    for (const m of recent) {
      if (next.has(m.fromSeat)) continue;
      const chip = evidenceFromText(m.text, seats);
      if (chip) next.set(m.fromSeat, chip);
    }
    if (next.size) evidenceChips = next;
  }

  function showError(el, msg) {
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function saveSession(token) {
    if (!token) return;
    try {
      localStorage.setItem(SESSION_KEY, token);
    } catch (_) {
      /* ignore quota / private mode */
    }
  }

  function loadSession() {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch (_) {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  function enterGame() {
    joinScreen.hidden = true;
    game.hidden = false;
  }

  function leaveToJoin(message) {
    view = null;
    selectedSeatId = null;
    lastPhase = null;
    game.hidden = true;
    joinScreen.hidden = false;
    showError(joinError, message || "");
    showError(gameError, "");
    syncScene();
  }

  function onSeatClick(seatId) {
    if (!view) return;
    const seat = view.seats.find((s) => s.seatId === seatId);
    if (!seat) return;
    const admin = view.allowed.admin || [];
    const acts = view.allowed.act || [];
    if (acts.includes("vote") && seat.alive) {
      selectedSeatId = seat.seatId;
      socket.emit("act", { type: "vote", payload: { seatId: seat.seatId } });
      syncScene();
      return;
    }
    if (admin.includes("setAlive") && view.phase !== "vote") {
      selectedSeatId = seat.seatId;
      socket.emit("setAlive", { seatId: seat.seatId, alive: !seat.alive });
      syncScene();
    }
  }

  function showWebglFallback(message) {
    sceneState = "failed";
    if (fallbackEl) fallbackEl.hidden = false;
    if (message && fallbackMsg) fallbackMsg.textContent = message;
    renderSeatFallback();
  }

  function speakerSeatId() {
    const msgs = view?.channels?.public || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const from = msgs[i].fromSeat;
      if (typeof from === "number" && from >= 0) return from;
    }
    return null;
  }

  function renderSeatFallback() {
    if (!seatFallback) return;
    seatFallback.innerHTML = "";
    if (sceneState !== "failed" || !view) return;
    view.seats.forEach((seat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = seat.alive ? seat.name : `${seat.name} (dead)`;
      btn.addEventListener("click", () => onSeatClick(seat.seatId));
      seatFallback.appendChild(btn);
    });
  }

  function syncScene() {
    if (!view) {
      sceneApi.sync({
        phase: "lobby",
        seats: [],
        youSeatId: null,
        speakerSeatId: null,
        voteSeatId: null,
        interactive: false,
      });
      renderSeatFallback();
      return;
    }
    const admin = view.allowed.admin || [];
    const acts = view.allowed.act || [];
    const voteSeat =
      view.phase === "vote" && view.meta?.youVoted
        ? view.meta.yourVoteTarget
        : selectedSeatId;
    sceneApi.sync({
      phase: view.phase,
      seats: view.seats,
      youSeatId: view.you.seatId,
      speakerSeatId: speakerSeatId(),
      voteSeatId: voteSeat,
      interactive: admin.includes("setAlive") || acts.includes("vote"),
    });
    renderSeatFallback();
  }

  function tryResume() {
    const token = loadSession();
    if (!token || resumeAttempted) return;
    resumeAttempted = true;
    socket.emit("resume", { token }, (res) => {
      if (res?.ok) {
        saveSession(res.token);
        enterGame();
        return;
      }
      clearSession();
    });
  }

  joinBtn.addEventListener("click", () => {
    const name = document.getElementById("name").value.trim();
    const pin = document.getElementById("pin").value.trim();
    const host = document.getElementById("want-host").checked;
    showError(joinError, "");
    socket.emit("join", { name, pin, host }, (res) => {
      if (!res?.ok) {
        showError(joinError, res?.message || "Join failed");
        return;
      }
      saveSession(res.token);
      enterGame();
    });
  });

  socket.on("connect", () => {
    resumeAttempted = false;
    tryResume();
  });

  socket.on("joined", (payload) => {
    if (payload?.token) saveSession(payload.token);
    enterGame();
  });

  socket.on("state", (payload) => {
    view = payload.view;
    render();
  });

  socket.on("room_cleared", () => {
    clearSession();
    leaveToJoin("Table cleared — join again");
  });

  socket.on("session_taken", () => {
    leaveToJoin("Session opened in another tab");
  });

  socket.on("error_msg", (payload) => {
    showError(gameError, payload.message || payload.error);
  });

  openWindowBtn.addEventListener("click", () => {
    socket.emit("openWindow", {});
  });

  closeWindowBtn.addEventListener("click", () => {
    socket.emit("closeWindow", { reveal: true });
  });

  startGameBtn.addEventListener("click", () => {
    const label = view?.lobby?.selectedThemeLabel || "the town";
    if (!window.confirm(`Start under ${label}? Lore names deal and the lobby closes.`)) return;
    socket.emit("startGame");
  });

  addBotBtn.addEventListener("click", () => {
    socket.emit("addBot", {});
  });

  resetGameBtn.addEventListener("click", () => {
    if (!window.confirm("Reset round? Seats stay; chat and deaths clear.")) return;
    socket.emit("resetGame");
  });

  resetRoomBtn.addEventListener("click", () => {
    if (!window.confirm("Clear the whole table? Everyone must rejoin.")) return;
    socket.emit("resetRoom");
  });

  sayForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = sayInput.value.trim();
    if (!text) return;
    const channel =
      view?.allowed?.say?.includes("shadow") && view.phase === "night"
        ? "shadow"
        : "public";
    socket.emit("say", { channel, text });
    sayInput.value = "";
  });

  submitForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = submitInput.value.trim();
    if (!text) return;
    socket.emit("submit", { text });
    submitInput.value = "";
  });

  readyBtn.addEventListener("click", () => {
    socket.emit("act", { type: "ready", payload: {} });
  });

  if (blockNightBtn) {
    blockNightBtn.addEventListener("click", () => {
      socket.emit("act", { type: "blockNight", payload: {} });
    });
  }

  function phaseHud(phase) {
    return String(phase || "lobby").toUpperCase();
  }

  function shortName(name) {
    const s = String(name || "?").trim();
    if (s.length <= 8) return s;
    return s.slice(0, 7) + "…";
  }

  function renderHostStrip() {
    const admin = view.allowed.admin || [];
    const isHost = Boolean(view.you.host) || view.allowed.setPhase;
    hostControls.hidden = !isHost;

    phaseButtons.innerHTML = "";
    (view.phases || []).forEach((phase) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(phase).toUpperCase();
      btn.className = view.phase === phase ? "is-active" : "";
      btn.disabled = !view.allowed.setPhase;
      btn.addEventListener("click", () => {
        socket.emit("setPhase", { phase });
      });
      phaseButtons.appendChild(btn);
    });

    const canStart = admin.includes("startGame");
    const canSetTheme = admin.includes("setTheme");
    startGameBtn.hidden = !canStart;
    startGameBtn.disabled = !canStart;
    openWindowBtn.disabled = !admin.includes("openWindow") || Boolean(view.window?.open);
    closeWindowBtn.disabled = !admin.includes("closeWindow") || !view.window?.open;
    addBotBtn.hidden = !admin.includes("addBot");
    addBotBtn.disabled = !admin.includes("addBot");
    resetGameBtn.disabled = !admin.includes("resetGame");
    resetRoomBtn.disabled = !admin.includes("resetRoom");

    themeButtons.innerHTML = "";
    const themes = view.lobby?.themes || [];
    if (canSetTheme && themes.length) {
      themeButtons.hidden = false;
      themes.forEach((theme) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = theme.label.toUpperCase();
        btn.className =
          view.lobby.selectedTheme === theme.id ? "is-active" : "";
        btn.addEventListener("click", () => {
          socket.emit("setTheme", { theme: theme.id });
        });
        themeButtons.appendChild(btn);
      });
    } else {
      themeButtons.hidden = true;
    }

    if (view.lobby && view.phase === "lobby") {
      lobbyStatus.hidden = false;
      const readyBit =
        view.lobby.humanCount != null
          ? ` · ready ${view.lobby.readyHumans || 0}/${view.lobby.humanCount}`
          : "";
      const themeBit = view.lobby.selectedThemeLabel
        ? ` · ${view.lobby.selectedThemeLabel}`
        : "";
      lobbyStatus.textContent = `${view.lobby.pairs} pair(s) · ${view.lobby.seats} seats${readyBit}${themeBit} — ADD BOT, then READY (or START)`;
    } else if (view.lobby?.theme) {
      lobbyStatus.hidden = false;
      lobbyStatus.textContent = `Theme: ${view.lobby.theme}`;
    } else {
      lobbyStatus.hidden = true;
      lobbyStatus.textContent = "";
    }
  }

  function render() {
    if (!view) return;
    showError(gameError, "");
    const hud = phaseHud(view.phase);
    phaseLabel.textContent = hud;
    if (lastPhase !== null && lastPhase !== view.phase) {
      phaseLabel.classList.remove("is-live");
      void phaseLabel.offsetWidth;
      phaseLabel.classList.add("is-live");
    }
    lastPhase = view.phase;
    document.body.classList.forEach((c) => {
      if (c.startsWith("phase-")) document.body.classList.remove(c);
    });
    document.body.classList.add(`phase-${String(view.phase || "lobby").toLowerCase()}`);
    const deadTag = view.you.alive ? "" : " · DEAD";
    youLabel.textContent = `${view.you.name} · #${view.you.seatId}${view.you.host ? " · HOST" : ""}${deadTag}`;

    if (sideLabel) {
      if (view.you.kind === "human") {
        sideLabel.hidden = false;
        sideLabel.textContent = "YOU ARE HUMAN";
        sideLabel.className = "side-label side-human";
      } else if (view.you.kind === "bot") {
        sideLabel.hidden = false;
        sideLabel.textContent = view.meta?.shadowLabel
          ? `YOU ARE A BOT · ${view.meta.shadowLabel}`
          : "YOU ARE A BOT";
        sideLabel.className = "side-label side-bot";
      } else {
        sideLabel.hidden = true;
      }
    }

    const started = Boolean(view.lobby?.started) || (view.phase && view.phase !== "lobby");
    if (cityPoints) {
      if (view.meta && started) {
        cityPoints.hidden = false;
        const slow = view.meta.slowdown ? ` · ${String(view.meta.slowdown).toUpperCase()}` : "";
        const goal =
          view.meta.winMode === "survival" && view.meta.cityPointGoal
            ? `/${view.meta.cityPointGoal}`
            : "";
        cityPoints.textContent = `CITY PTS: ${view.meta.cityPoints ?? 0}${goal}${slow}`;
      } else {
        cityPoints.hidden = true;
      }
    }
    if (winGoal) {
      if (view.meta && started && view.phase !== "ended") {
        winGoal.hidden = false;
        if (view.meta.winMode === "parity") {
          winGoal.textContent = "WIN: keep majority · wipe shadows";
        } else {
          const n = view.meta.nightsSurvived ?? 0;
          const need = view.meta.surviveNights ?? 3;
          winGoal.textContent = `WIN: nights ${n}/${need} · pts goal · or wipe shadows`;
        }
      } else if (view.meta?.winner) {
        winGoal.hidden = false;
        winGoal.textContent = `${String(view.meta.winner).toUpperCase()} WIN`;
      } else {
        winGoal.hidden = true;
      }
    }

    renderHostStrip();

    const windowOpen = Boolean(view.window?.open);
    const isCrisis = view.phase === "crisis";
    const isVote = view.phase === "vote";
    const isNight = view.phase === "night";
    const activePrompt =
      (isCrisis && view.meta?.crisisPrompt) ||
      (view.phase === "talk" && view.meta?.talkPrompt) ||
      (windowOpen && (view.meta?.crisisPrompt || view.meta?.talkPrompt)) ||
      "";

    if (nowAction && nowDetail) {
      const guide = view.meta?.guide;
      if (windowOpen && activePrompt) {
        nowAction.textContent = isCrisis ? "CRISIS — ANSWER" : "DAY TALK — ANSWER";
        nowDetail.textContent = activePrompt;
      } else if (guide?.action) {
        nowAction.textContent = guide.action;
        nowDetail.textContent =
          activePrompt || guide.detail || view.meta?.lastTown || "";
      } else {
        nowAction.textContent = phaseHud(view.phase);
        nowDetail.textContent =
          activePrompt || view.meta?.lastTown || "Watch Town lines in chat.";
      }
    }

    const humanNight = isNight && view.you.kind === "human";
    if (nightVeil) {
      nightVeil.hidden = !humanNight;
    }
    document.body.classList.toggle("night-human", humanNight);
    document.body.classList.toggle("night-bot", isNight && view.you.kind === "bot");
    chatWrap.classList.toggle("is-sealed", windowOpen);
    document.body.classList.toggle("has-sealed-prompt", Boolean(windowOpen && activePrompt));
    windowBanner.hidden = !windowOpen;
    if (windowOpen) {
      const waiting = view.window.youSubmitted;
      windowStatus.textContent = activePrompt
        ? activePrompt
        : isCrisis
          ? waiting
            ? "Crisis answer in — waiting on the table"
            : "Crisis answer — others see the count"
          : waiting
            ? "You’re in — waiting on the table"
            : "Blind write open";
      windowCount.textContent = waiting
        ? `${view.window.submitted} in · you’re locked`
        : `${view.window.submitted} submitted`;
      submitInput.maxLength = view.window.maxLen || 160;
      submitInput.placeholder = activePrompt
        ? `Your answer — sealed (${view.window.maxLen || 160} max)`
        : isCrisis
          ? "Answer the crisis…"
          : "Blind line — others can’t see this yet…";
    }

    if (voteBanner) {
      voteBanner.hidden = !isVote;
      if (isVote) {
        if (view.meta?.youVoted) {
          const target = view.seats.find((s) => s.seatId === view.meta.yourVoteTarget);
          voteStatus.textContent = target
            ? `You voted ${target.name}`
            : "Vote locked in";
        } else {
          voteStatus.textContent = "VOTE — click a living seat";
        }
        voteCount.textContent = `${view.meta?.votesCast || 0}/${view.meta?.votesNeeded || 0} voted`;
      }
    }

    const msgs = view.channels.public || [];
    if (msgs.length > lastPublicLen) {
      const newest = msgs[msgs.length - 1];
      if (newest && /vanished/i.test(newest.text || "")) {
        view.seats.forEach((s) => {
          if (!s.alive && prevAlive.get(s.seatId) === true) {
            vanishSeats.add(s.seatId);
          }
        });
      }
      if (
        newest &&
        newest.fromSeat >= 0 &&
        (view.phase === "talk" ||
          view.phase === "crisis" ||
          view.phase === "vote" ||
          /Reveal:|Crisis judged/i.test(newest.text || ""))
      ) {
        refreshEvidence(msgs, view.seats);
      }
      // Batch reveals share one timestamp — refresh when several player lines land.
      const added = msgs.slice(lastPublicLen).filter((m) => m.fromSeat >= 0);
      if (added.length >= 2) refreshEvidence(msgs, view.seats);
    }
    lastPublicLen = msgs.length;
    view.seats.forEach((s) => {
      if (prevAlive.get(s.seatId) === true && !s.alive) {
        vanishSeats.add(s.seatId);
      }
      prevAlive.set(s.seatId, s.alive);
    });

    if (selectedSeatId != null && !view.seats.some((s) => s.seatId === selectedSeatId)) {
      selectedSeatId = null;
    }
    if (vanishSeats.size) {
      setTimeout(() => {
        vanishSeats.clear();
      }, 1200);
    }
    syncScene();
    chat.innerHTML = msgs
      .map((m) => {
        const isTown = m.name === "Town" || m.fromSeat === -1;
        const cls = isTown ? "msg msg-town" : "msg";
        return `<div class="${cls}"><span class="who">${escapeHtml(m.name)}</span>${escapeHtml(m.text)}</div>`;
      })
      .join("");
    chat.scrollTop = chat.scrollHeight;

    const canShadow = view.allowed.say.includes("shadow");
    const showShadow =
      view.phase === "night" &&
      view.you.kind === "bot" &&
      Array.isArray(view.channels.shadow);
    if (shadowBanner) {
      shadowBanner.hidden = !showShadow;
      if (showShadow) {
        shadowStatus.textContent = view.meta?.shadowLabel
          ? `${view.meta.shadowLabel} · NIGHT`
          : "SHADOW CHANNEL";
        shadowCount.textContent =
          view.meta?.nightStage === "vote"
            ? `${view.meta.shadowVotesCast || 0}/${view.meta.shadowVotesNeeded || 0} strike votes`
            : "whisper only";
      }
    }
    if (shadowChat) {
      shadowChat.hidden = !showShadow;
      if (showShadow) {
        const smsgs = view.channels.shadow || [];
        shadowChat.innerHTML = smsgs
          .map(
            (m) =>
              `<div class="msg msg-shadow"><span class="who">${escapeHtml(m.name)}</span>${escapeHtml(m.text)}</div>`
          )
          .join("");
        shadowChat.scrollTop = shadowChat.scrollHeight;
      }
    }

    if (blockNightBtn) {
      const canBlock = Boolean(view.meta?.canBlockNight);
      blockNightBtn.hidden = !canBlock;
      blockNightBtn.disabled = !canBlock;
    }

    const canSay =
      view.allowed.say.includes("public") ||
      view.allowed.say.includes("shadow");
    const sayChannel = view.allowed.say.includes("shadow")
      ? "shadow"
      : "public";
    sayForm.hidden = windowOpen || !canSay;
    sayInput.disabled = !canSay;
    sayForm.querySelector("button").disabled = !canSay;
    if (canShadow) {
      sayInput.placeholder = "Shadow whisper…";
    } else {
      sayInput.placeholder = "Be careful what you put on the record…";
    }

    const canSubmit = windowOpen && view.allowed.act.includes("submit");
    submitForm.hidden = !windowOpen;
    submitInput.disabled = !canSubmit;
    submitForm.querySelector("button").disabled = !canSubmit;

    if (windowOpen && view.window.yourDraft) {
      yourDraft.hidden = false;
      yourDraft.textContent = `Your sealed line: ${view.window.yourDraft}`;
    } else {
      yourDraft.hidden = true;
      yourDraft.textContent = "";
    }

    readyBtn.disabled = !view.allowed.act.includes("ready");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function initScene() {
    try {
      const mod = await import("./scene.js");
      const api = mod.createTableScene(canvas, {
        onSeatClick,
        onUnavailable: () =>
          showWebglFallback(
            "3D view unavailable — this browser has no WebGL. Seats are listed below; chat and phase controls still work."
          ),
      });
      sceneApi = api;
      if (!api.available) {
        showWebglFallback(
          "3D view unavailable — this browser has no WebGL. Seats are listed below; chat and phase controls still work."
        );
      } else {
        sceneState = "ready";
        if (fallbackEl) fallbackEl.hidden = true;
      }
      syncScene();
    } catch (err) {
      console.error(err);
      showWebglFallback(
        "3D view failed to load. Seats are listed below; chat and phase controls still work."
      );
    }
  }

  window.__dining = {
    debug: () => sceneApi.debug(),
    projectSeat: (seatId) => sceneApi.projectSeat(seatId),
    ready: () => sceneState === "ready",
  };

  initScene();
})();
