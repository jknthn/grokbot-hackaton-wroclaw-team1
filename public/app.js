(() => {
  const SESSION_KEY = "grokmafia.session";
  const socket = io();

  const joinScreen = document.getElementById("join-screen");
  const game = document.getElementById("game");
  const joinBtn = document.getElementById("join-btn");
  const joinError = document.getElementById("join-error");
  const gameError = document.getElementById("game-error");
  const phaseLabel = document.getElementById("phase-label");
  const youLabel = document.getElementById("you-label");
  const hostControls = document.getElementById("host-controls");
  const phaseButtons = document.getElementById("phase-buttons");
  const startGameBtn = document.getElementById("start-game-btn");
  const openWindowBtn = document.getElementById("open-window-btn");
  const closeWindowBtn = document.getElementById("close-window-btn");
  const addBotBtn = document.getElementById("add-bot-btn");
  const resetGameBtn = document.getElementById("reset-game-btn");
  const resetRoomBtn = document.getElementById("reset-room-btn");
  const lobbyStatus = document.getElementById("lobby-status");
  const table = document.getElementById("table");
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
    if (!window.confirm("Start the town? Lore names deal and the lobby closes.")) return;
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
    startGameBtn.hidden = !canStart;
    startGameBtn.disabled = !canStart;
    openWindowBtn.disabled = !admin.includes("openWindow") || Boolean(view.window?.open);
    closeWindowBtn.disabled = !admin.includes("closeWindow") || !view.window?.open;
    addBotBtn.hidden = !admin.includes("addBot");
    addBotBtn.disabled = !admin.includes("addBot");
    resetGameBtn.disabled = !admin.includes("resetGame");
    resetRoomBtn.disabled = !admin.includes("resetRoom");

    if (view.lobby && view.phase === "lobby") {
      lobbyStatus.hidden = false;
      lobbyStatus.textContent = `${view.lobby.pairs} pair(s) · ${view.lobby.seats} seats — START when ready`;
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

    renderHostStrip();

    const windowOpen = Boolean(view.window?.open);
    chatWrap.classList.toggle("is-sealed", windowOpen);
    windowBanner.hidden = !windowOpen;
    if (windowOpen) {
      windowStatus.textContent = view.window.youSubmitted
        ? "You’re in — waiting on the table"
        : "Blind write open";
      windowCount.textContent = `${view.window.submitted} submitted`;
      submitInput.maxLength = view.window.maxLen || 160;
    }

    const n = Math.max(view.seats.length, 1);
    table.innerHTML = "";
    view.seats.forEach((seat, i) => {
      const el = document.createElement("div");
      const classes = ["seat"];
      if (seat.kind) classes.push(seat.kind);
      if (seat.seatId === view.you.seatId) classes.push("you");
      if (!seat.alive) classes.push("dead");
      if (selectedSeatId === seat.seatId) classes.push("selected");
      el.className = classes.join(" ");
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = 38;
      el.style.left = `${50 + r * Math.cos(angle)}%`;
      el.style.top = `${50 + r * Math.sin(angle)}%`;
      const kindHtml =
        seat.kind != null
          ? `<span class="kind">${escapeHtml(seat.kind)}</span>`
          : "";
      el.innerHTML = `<span>${escapeHtml(shortName(seat.name))}</span>${kindHtml}`;
      el.title = seat.alive ? seat.name : `${seat.name} (dead)`;
      if ((view.allowed.admin || []).includes("setAlive")) {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
          selectedSeatId = seat.seatId;
          socket.emit("setAlive", { seatId: seat.seatId, alive: !seat.alive });
        });
      }
      table.appendChild(el);
    });

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
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
