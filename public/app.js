(() => {
  const socket = io();

  const joinScreen = document.getElementById("join-screen");
  const game = document.getElementById("game");
  const joinBtn = document.getElementById("join-btn");
  const joinError = document.getElementById("join-error");
  const gameError = document.getElementById("game-error");
  const phaseLabel = document.getElementById("phase-label");
  const youLabel = document.getElementById("you-label");
  const hostControls = document.getElementById("host-controls");
  const table = document.getElementById("table");
  const chat = document.getElementById("chat");
  const sayForm = document.getElementById("say-form");
  const sayInput = document.getElementById("say-input");
  const readyBtn = document.getElementById("ready-btn");

  let view = null;

  function showError(el, msg) {
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
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
      joinScreen.hidden = true;
      game.hidden = false;
    });
  });

  socket.on("joined", () => {
    joinScreen.hidden = true;
    game.hidden = false;
  });

  socket.on("state", (payload) => {
    view = payload.view;
    render();
  });

  socket.on("error_msg", (payload) => {
    showError(gameError, payload.message || payload.error);
  });

  hostControls.querySelectorAll("button[data-phase]").forEach((btn) => {
    btn.addEventListener("click", () => {
      socket.emit("setPhase", { phase: btn.dataset.phase });
    });
  });

  sayForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = sayInput.value.trim();
    if (!text) return;
    socket.emit("say", { channel: "public", text });
    sayInput.value = "";
  });

  readyBtn.addEventListener("click", () => {
    socket.emit("act", { type: "ready", payload: {} });
  });

  function render() {
    if (!view) return;
    showError(gameError, "");
    phaseLabel.textContent = `Phase: ${view.phase}`;
    youLabel.textContent = `${view.you.name} · seat ${view.you.seatId}${view.you.host ? " · host" : ""}`;
    hostControls.hidden = !view.allowed.setPhase;

    const n = Math.max(view.seats.length, 1);
    table.innerHTML = "";
    view.seats.forEach((seat, i) => {
      const el = document.createElement("div");
      el.className = `seat ${seat.kind}${seat.seatId === view.you.seatId ? " you" : ""}`;
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = 38;
      el.style.left = `${50 + r * Math.cos(angle)}%`;
      el.style.top = `${50 + r * Math.sin(angle)}%`;
      el.innerHTML = `<span>${escapeHtml(seat.name)}</span><span class="kind">${seat.kind}</span>`;
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
    sayInput.disabled = !canSay;
    sayForm.querySelector("button").disabled = !canSay;
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
