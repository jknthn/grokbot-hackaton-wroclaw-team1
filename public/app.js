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
  const voteBanner = document.getElementById("vote-banner");
  const voteStatus = document.getElementById("vote-status");
  const voteCount = document.getElementById("vote-count");
  const nowAction = document.getElementById("now-action");
  const nowDetail = document.getElementById("now-detail");
  const readyBtn = document.getElementById("ready-btn");

  let view = null;
  let lastPhase = null;
  let selectedSeatId = null;
  let resumeAttempted = false;
  /** @type {Map<number, boolean>} */
  let prevAlive = new Map();
  /** @type {Set<number>} */
  let vanishSeats = new Set();
  let lastPublicLen = 0;

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
        cityPoints.textContent = `CITY PTS: ${view.meta.cityPoints ?? 0}${slow}`;
      } else {
        cityPoints.hidden = true;
      }
    }

    renderHostStrip();

    if (nowAction && nowDetail) {
      const guide = view.meta?.guide;
      if (guide?.action) {
        nowAction.textContent = guide.action;
        nowDetail.textContent = guide.detail || view.meta?.lastTown || "";
      } else {
        nowAction.textContent = phaseHud(view.phase);
        nowDetail.textContent = view.meta?.lastTown || "Watch Town lines in chat.";
      }
    }

    const windowOpen = Boolean(view.window?.open);
    const isCrisis = view.phase === "crisis";
    const isVote = view.phase === "vote";
    const canVote = isVote && view.allowed.act.includes("vote");
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
    const recentSpeakers = new Set();
    for (let i = msgs.length - 1; i >= 0 && recentSpeakers.size < 3; i--) {
      const m = msgs[i];
      if (typeof m.fromSeat === "number" && m.fromSeat >= 0) {
        recentSpeakers.add(m.fromSeat);
      }
    }
    if (msgs.length > lastPublicLen) {
      const newest = msgs[msgs.length - 1];
      if (newest && /vanished/i.test(newest.text || "")) {
        view.seats.forEach((s) => {
          if (!s.alive && prevAlive.get(s.seatId) === true) {
            vanishSeats.add(s.seatId);
          }
        });
      }
    }
    lastPublicLen = msgs.length;
    view.seats.forEach((s) => {
      if (prevAlive.get(s.seatId) === true && !s.alive) {
        vanishSeats.add(s.seatId);
      }
      prevAlive.set(s.seatId, s.alive);
    });

    const n = Math.max(view.seats.length, 1);
    table.innerHTML = "";
    view.seats.forEach((seat, i) => {
      const el = document.createElement("div");
      const classes = ["seat"];
      if (seat.kind) classes.push(seat.kind);
      if (seat.seatId === view.you.seatId) classes.push("you");
      if (!seat.alive) classes.push("dead");
      if (selectedSeatId === seat.seatId) classes.push("selected");
      if (isVote && view.meta?.youVoted && view.meta.yourVoteTarget === seat.seatId) {
        classes.push("voted", "vote-target");
      }
      if (seat.alive && recentSpeakers.has(seat.seatId)) classes.push("spoke");
      if (vanishSeats.has(seat.seatId)) classes.push("vanish");
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

      if (canVote && seat.alive) {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
          selectedSeatId = seat.seatId;
          socket.emit("act", { type: "vote", payload: { seatId: seat.seatId } });
        });
      } else if (
        !isVote &&
        (view.allowed.admin || []).includes("setAlive")
      ) {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
          selectedSeatId = seat.seatId;
          socket.emit("setAlive", { seatId: seat.seatId, alive: !seat.alive });
        });
      }
      table.appendChild(el);
    });

    if (vanishSeats.size) {
      setTimeout(() => {
        vanishSeats.clear();
      }, 1200);
    }
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
})();
