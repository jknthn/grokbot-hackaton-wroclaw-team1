(() => {
  const socket = io();

  const phaseEl = document.getElementById("stream-phase");
  const pointsEl = document.getElementById("stream-points");
  const seatsEl = document.getElementById("stream-seats");
  const themeEl = document.getElementById("stream-theme");
  const actionEl = document.getElementById("stream-action");
  const detailEl = document.getElementById("stream-detail");
  const tableEl = document.getElementById("stream-table");
  const windowEl = document.getElementById("stream-window");
  const chatEl = document.getElementById("stream-chat");

  let view = null;
  let lastPhase = null;
  let lastMsgCount = 0;

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
    phaseEl.textContent = phase;
    if (lastPhase !== null && lastPhase !== view.phase) {
      phaseEl.classList.remove("is-live");
      void phaseEl.offsetWidth;
      phaseEl.classList.add("is-live");
    }
    lastPhase = view.phase;

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
    if (guide?.action || guide?.detail) {
      actionEl.textContent = guide.action || phase;
      detailEl.textContent = guide.detail || "";
    } else if (view.meta?.lastTown) {
      actionEl.textContent = phase;
      detailEl.textContent = view.meta.lastTown;
    } else if (view.phase === "lobby") {
      actionEl.textContent = "LOBBY";
      const pairs = view.lobby?.pairs ?? 0;
      detailEl.textContent = pairs
        ? `${pairs} pair(s) gathering — host packs the table`
        : "Waiting for players to join";
    } else {
      actionEl.textContent = phase;
      detailEl.textContent = view.meta?.crisisPrompt || view.meta?.talkPrompt || "";
    }

    if (view.window?.open) {
      windowEl.hidden = false;
      windowEl.textContent = `SEALED WRITE  ${view.window.submitted}/${view.window.living || total || "?"} `;
    } else {
      windowEl.hidden = true;
      windowEl.textContent = "";
    }

    const seats = view.seats || [];
    const n = Math.max(seats.length, 1);
    tableEl.innerHTML = "";
    seats.forEach((seat, i) => {
      const el = document.createElement("div");
      const classes = ["seat"];
      if (!seat.alive) classes.push("dead");
      el.className = classes.join(" ");
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = 38;
      el.style.left = `${50 + r * Math.cos(angle)}%`;
      el.style.top = `${50 + r * Math.sin(angle)}%`;
      el.innerHTML = `<span>${escapeHtml(shortName(seat.name))}</span><span class="kind">#${seat.seatId}</span>`;
      el.title = seat.alive ? seat.name : `${seat.name} (out)`;
      tableEl.appendChild(el);
    });

    const msgs = view.channels?.public || [];
    chatEl.innerHTML = msgs
      .map((m, idx) => {
        const town = m.name === "Town" || m.fromSeat === -1;
        const fresh = idx >= lastMsgCount;
        return `<div class="msg${town ? " is-town" : ""}${fresh ? " is-fresh" : ""}"><span class="who">${escapeHtml(m.name)}</span>${escapeHtml(m.text)}</div>`;
      })
      .join("");
    chatEl.scrollTop = chatEl.scrollHeight;
    lastMsgCount = msgs.length;
  }
})();
