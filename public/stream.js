(() => {
  const PHASE_ORDER = ["lobby", "talk", "crisis", "vote", "night", "ended"];

  const socket = io();

  const body = document.body;
  const phaseEl = document.getElementById("stream-phase");
  const pointsEl = document.getElementById("stream-points");
  const seatsEl = document.getElementById("stream-seats");
  const themeEl = document.getElementById("stream-theme");
  const actionEl = document.getElementById("stream-action");
  const detailEl = document.getElementById("stream-detail");
  const bannerEl = document.getElementById("stream-banner");
  const railEl = document.getElementById("stream-rail");
  const tableEl = document.getElementById("stream-table");
  const windowEl = document.getElementById("stream-window");
  const windowFillEl = document.getElementById("stream-window-fill");
  const windowCountEl = document.getElementById("stream-window-count");
  const voteEl = document.getElementById("stream-vote");
  const voteCountEl = document.getElementById("stream-vote-count");
  const chatEl = document.getElementById("stream-chat");
  const chatMetaEl = document.getElementById("stream-chat-meta");
  const townFocusEl = document.getElementById("stream-town-focus");
  const townLineEl = document.getElementById("stream-town-line");
  const focusTagEl = document.getElementById("stream-focus-tag");

  let view = null;
  let lastPhase = null;
  let lastMsgCount = 0;
  let lastSpeakerSeat = null;
  let focusSeatId = null;
  let focusLabel = "";
  let prevAlive = new Map();

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shortName(name) {
    const s = String(name || "?").trim();
    if (s.length <= 10) return s;
    return s.slice(0, 9) + "…";
  }

  function phaseHud(phase) {
    return String(phase || "lobby").toUpperCase();
  }

  function setPhaseClass(phase) {
    body.classList.forEach((c) => {
      if (c.startsWith("phase-")) body.classList.remove(c);
    });
    body.classList.add(`phase-${String(phase || "lobby").toLowerCase()}`);
  }

  function renderRail(phase) {
    const current = String(phase || "lobby").toLowerCase();
    const idx = PHASE_ORDER.indexOf(current);
    railEl.innerHTML = PHASE_ORDER.map((p, i) => {
      const classes = ["step"];
      if (i < idx) classes.push("is-done");
      if (i === idx || (idx < 0 && p === current)) classes.push("is-now");
      return `<span class="${classes.join(" ")}">${p.toUpperCase()}</span>`;
    }).join("");
  }

  socket.on("connect", () => {
    socket.emit("observe", {}, () => {});
  });

  socket.on("stream", (payload) => {
    view = payload.view;
    render();
  });

  function render() {
    if (!view) return;

    const phase = phaseHud(view.phase);
    const sealed = Boolean(view.window?.open);
    setPhaseClass(view.phase);
    body.classList.toggle("is-sealed", sealed);

    phaseEl.textContent = phase;
    if (lastPhase !== null && lastPhase !== view.phase) {
      phaseEl.classList.remove("is-live");
      void phaseEl.offsetWidth;
      phaseEl.classList.add("is-live");
    }
    lastPhase = view.phase;
    renderRail(view.phase);

    const pts = view.meta?.cityPoints;
    if (pts != null && view.phase !== "lobby") {
      pointsEl.hidden = false;
      pointsEl.textContent = `CITY PTS: ${pts}`;
    } else {
      pointsEl.hidden = true;
    }

    const living = (view.seats || []).filter((s) => s.alive).length;
    const total = (view.seats || []).length;
    seatsEl.textContent = total ? `${living}/${total} ALIVE` : "EMPTY TABLE";

    const theme = view.lobby?.theme || view.lobby?.selectedThemeLabel;
    themeEl.textContent = theme ? `· ${theme}` : "";

    const guide = view.meta?.guide;
    let action = phase;
    let detail = "";
    let urgent = false;

    if (sealed) {
      action = "SEALED WRITE";
      detail = `Town writes blind — ${view.window.submitted}/${view.window.living || living || "?"} in`;
      urgent = true;
    } else if (guide?.action || guide?.detail) {
      action = guide.action || phase;
      detail = guide.detail || "";
    } else if (view.meta?.lastTown) {
      action = phase;
      detail = view.meta.lastTown;
    } else if (view.phase === "lobby") {
      action = "LOBBY";
      const pairs = view.lobby?.pairs ?? 0;
      detail = pairs
        ? `${pairs} pair(s) gathering — host packs the table`
        : "Waiting for players to join";
    } else if (view.phase === "vote") {
      action = "VOTE";
      detail = `Ballots ${view.meta?.votesCast || 0}/${view.meta?.votesNeeded || living}`;
      urgent = true;
    } else if (view.phase === "night") {
      action = "NIGHT";
      detail = view.meta?.nightStage
        ? `Shadows · ${String(view.meta.nightStage).toUpperCase()}`
        : "Shadows meet. Town waits.";
      urgent = true;
    } else if (view.phase === "ended") {
      action = "ENDED";
      detail = view.meta?.winner
        ? `Winner: ${view.meta.winner}`
        : view.meta?.lastTown || "Table closed";
    } else {
      detail = view.meta?.crisisPrompt || view.meta?.talkPrompt || "";
    }

    actionEl.textContent = action;
    detailEl.textContent = detail;
    bannerEl.classList.toggle("is-urgent", urgent);

    let centerSub = living ? `${living} living` : "empty";
    if (sealed) centerSub = "eyes down";
    else if (view.phase === "night") centerSub = "lights out";
    else if (view.phase === "vote") centerSub = "ballots";
    else if (view.phase === "crisis") centerSub = "crisis";
    else if (view.phase === "ended") centerSub = view.meta?.winner || "done";

    if (sealed) {
      windowEl.hidden = false;
      const need = view.window.living || living || 1;
      const have = view.window.submitted || 0;
      const pct = Math.min(100, Math.round((have / need) * 100));
      windowFillEl.style.width = `${pct}%`;
      windowCountEl.textContent = `${have} / ${need} sealed`;
    } else {
      windowEl.hidden = true;
      windowFillEl.style.width = "0%";
    }

    if (view.phase === "vote") {
      voteEl.hidden = false;
      voteCountEl.textContent = `VOTES ${view.meta?.votesCast || 0}/${view.meta?.votesNeeded || living}`;
    } else {
      voteEl.hidden = true;
    }

    const msgs = view.channels?.public || [];
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && typeof lastMsg.fromSeat === "number" && lastMsg.fromSeat >= 0) {
      lastSpeakerSeat = lastMsg.fromSeat;
      focusSeatId = lastMsg.fromSeat;
      focusLabel = `ON AIR · ${lastMsg.name}`;
    }

    const lastTown = [...msgs].reverse().find((m) => m.name === "Town" || m.fromSeat === -1);
    if (townFocusEl && townLineEl) {
      if (lastTown?.text) {
        townFocusEl.hidden = false;
        townLineEl.textContent = lastTown.text;
        townFocusEl.classList.toggle(
          "is-beat",
          /vanished|voted out|CRISIS|NIGHT|ENDED|Quiet night/i.test(lastTown.text)
        );
      } else {
        townFocusEl.hidden = true;
      }
    }

    const seats = view.seats || [];
    seats.forEach((seat) => {
      if (prevAlive.get(seat.seatId) === true && !seat.alive) {
        focusSeatId = seat.seatId;
        focusLabel = `VANISHED · ${seat.name}`;
      }
      prevAlive.set(seat.seatId, seat.alive);
    });

    if (focusTagEl) {
      if (focusLabel && focusSeatId != null) {
        focusTagEl.hidden = false;
        focusTagEl.textContent = focusLabel;
      } else {
        focusTagEl.hidden = true;
      }
    }

    tableEl.innerHTML = "";
    const center = document.createElement("div");
    center.id = "stream-center";
    center.className = "stream-center";
    center.innerHTML = `<span id="stream-center-phase">${escapeHtml(phase)}</span><span id="stream-center-sub" class="muted">${escapeHtml(centerSub)}</span>`;
    tableEl.appendChild(center);

    const n = Math.max(seats.length, 1);
    seats.forEach((seat, i) => {
      const el = document.createElement("div");
      const classes = ["seat"];
      if (!seat.alive) classes.push("dead");
      if (seat.alive && sealed) classes.push("is-writing");
      if (seat.alive && !sealed && seat.seatId === lastSpeakerSeat) {
        classes.push("is-speaking");
      }
      if (seat.seatId === focusSeatId) classes.push("is-focus");
      if (view.phase === "night" && seat.alive) classes.push("silhouette");
      el.className = classes.join(" ");
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = 38;
      el.style.left = `${50 + r * Math.cos(angle)}%`;
      el.style.top = `${50 + r * Math.sin(angle)}%`;
      const label =
        view.phase === "night" && seat.alive
          ? `<span class="hood-icon"></span><span>?</span>`
          : `<span>${escapeHtml(shortName(seat.name))}</span><span class="kind">#${seat.seatId}</span>`;
      el.innerHTML = label;
      el.title = seat.alive ? seat.name : `${seat.name} (out)`;
      tableEl.appendChild(el);
    });

    chatMetaEl.textContent = msgs.length ? `${msgs.length} lines` : "";
    const nearBottom =
      chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 80;
    chatEl.innerHTML = msgs
      .map((m, idx) => {
        const town = m.name === "Town" || m.fromSeat === -1;
        const fresh = idx >= lastMsgCount;
        const seatBit =
          typeof m.fromSeat === "number" && m.fromSeat >= 0
            ? `<span class="kind">#${m.fromSeat}</span> `
            : "";
        return `<div class="msg${town ? " is-town" : ""}${fresh ? " is-fresh" : ""}"><span class="who">${seatBit}${escapeHtml(m.name)}</span>${escapeHtml(m.text)}</div>`;
      })
      .join("");
    if (nearBottom || msgs.length > lastMsgCount) {
      chatEl.scrollTop = chatEl.scrollHeight;
    }
    lastMsgCount = msgs.length;
  }
})();
