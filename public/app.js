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
  const youLabel = document.getElementById("you-label");
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
  const readyBtn = document.getElementById("ready-btn");

  let view = null;
  let lastPhase = null;
  let selectedSeatId = null;
  let resumeAttempted = false;
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
    socket.emit("say", { channel: "public", text });
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

  function onSeatClick(seatId) {
    if (!view) return;
    const seat = view.seats.find((s) => s.seatId === seatId);
    if (!seat) return;
    const admin = view.allowed.admin || [];
    const acts = view.allowed.act || [];
    if (admin.includes("setAlive")) {
      selectedSeatId = seat.seatId;
      socket.emit("setAlive", { seatId: seat.seatId, alive: !seat.alive });
      syncScene();
      return;
    }
    if (acts.includes("vote")) {
      selectedSeatId = seat.seatId;
      socket.emit("act", { type: "vote", payload: { seatId: seat.seatId } });
      syncScene();
    }
  }

  function showWebglFallback(message) {
    sceneState = "failed";
    fallbackEl.hidden = false;
    if (message) fallbackMsg.textContent = message;
    renderSeatFallback();
  }

  function phaseHud(phase) {
    return String(phase || "lobby").toUpperCase();
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
    sceneApi.sync({
      phase: view.phase,
      seats: view.seats,
      youSeatId: view.you.seatId,
      speakerSeatId: speakerSeatId(),
      voteSeatId: selectedSeatId,
      interactive: admin.includes("setAlive") || acts.includes("vote"),
    });
    renderSeatFallback();
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
      const themeBit = view.lobby.selectedThemeLabel
        ? ` · ${view.lobby.selectedThemeLabel}`
        : "";
      lobbyStatus.textContent = `${view.lobby.pairs} pair(s) · ${view.lobby.seats} seats${themeBit} — pick theme, then START`;
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
    const deadTag = view.you.alive ? "" : " · DEAD";
    youLabel.textContent = `${view.you.name} · #${view.you.seatId}${view.you.host ? " · HOST" : ""}${deadTag}`;

    const started = Boolean(view.lobby?.started) || (view.phase && view.phase !== "lobby");
    if (cityPoints) {
      if (view.meta && started) {
        cityPoints.hidden = false;
        const slow = view.meta.slowdown ? ` · ${String(view.meta.slowdown).toUpperCase()}` : "";
        cityPoints.textContent = `CITY PTS: ${view.meta.cityPoints ?? 0}${slow}`;
      } else {
        cityPoints.hidden = true;
      }
    }

    renderHostStrip();

    const windowOpen = Boolean(view.window?.open);
    const isCrisis = view.phase === "crisis";
    chatWrap.classList.toggle("is-sealed", windowOpen);
    windowBanner.hidden = !windowOpen;
    if (windowOpen) {
      if (isCrisis) {
        windowStatus.textContent = view.window.youSubmitted
          ? "Crisis answer in — waiting on the table"
          : "Crisis answer — others see the count";
      } else {
        windowStatus.textContent = view.window.youSubmitted
          ? "You’re in — waiting on the table"
          : "Blind write open";
      }
      windowCount.textContent = `${view.window.submitted} submitted`;
      submitInput.maxLength = view.window.maxLen || 160;
      submitInput.placeholder = isCrisis
        ? "Answer the crisis…"
        : "Blind line — others can’t see this yet…";
    }

    if (selectedSeatId != null && !view.seats.some((s) => s.seatId === selectedSeatId)) {
      selectedSeatId = null;
    }

    const msgs = view.channels.public || [];
    chat.innerHTML = msgs
      .map(
        (m) =>
          `<div class="msg"><span class="who">${escapeHtml(m.name)}</span>${escapeHtml(m.text)}</div>`
      )
      .join("");
    chat.scrollTop = chat.scrollHeight;

    const canSay = view.allowed.say.includes("public");
    sayForm.hidden = windowOpen;
    sayInput.disabled = !canSay;
    sayForm.querySelector("button").disabled = !canSay;

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
    syncScene();
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
