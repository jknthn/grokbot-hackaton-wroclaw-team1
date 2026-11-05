/**
 * Deterministic demo adapter for /demo — mocks socket.io only on that page.
 * All seat names and chat lines are fictional demo seed data.
 */
(() => {
  const DEMO_TOKEN = "demo-walkthrough-token";
  const YOU_SEAT = 4;
  const LORE_NAMES = [
    "Jed Mercer",
    "Opal Wren",
    "Mara Flint",
    "Calico June",
    "Kitty Blaze",
    "Flint Hoyt",
    "Eliza Thorn",
    "Dusty Pike",
  ];
  /** Observer-only (never sent to 3D labels). */
  const OBSERVER_KIND = ["bot", "human", "bot", "human", "human", "bot", "human", "bot"];

  const THEMES = [
    { id: "wildWest", label: "Wild West" },
    { id: "northJersey", label: "North Jersey" },
    { id: "deepHarbor", label: "Deep Harbor" },
    { id: "spaceColony", label: "Space Colony" },
  ];

  const handlers = {};
  let stepIndex = -1;
  let inGame = false;
  let observerOn = false;

  function msg(fromSeat, name, text) {
    return { fromSeat, name, text, ts: Date.now() };
  }

  function town(text) {
    return msg(-1, "Town", text);
  }

  function seats(opts = {}) {
    const pre = Boolean(opts.preDeal);
    const dead = new Set(opts.dead || []);
    return LORE_NAMES.map((name, seatId) => ({
      seatId,
      name: pre ? `Guest ${seatId + 1}` : name,
      alive: !dead.has(seatId),
    }));
  }

  function base(partial) {
    const phase = partial.phase || "lobby";
    const windowOpen = Boolean(partial.windowOpen);
    const admin = partial.admin || [];
    const act = partial.act || [];
    const say = partial.say || [];
    return {
      phase,
      phases: ["lobby", "talk", "crisis", "vote", "night", "ended"],
      you: {
        playerId: "demo-you",
        seatId: YOU_SEAT,
        name: partial.youName || LORE_NAMES[YOU_SEAT],
        host: true,
        alive: true,
        kind: "human",
      },
      seats: partial.seats || seats({ preDeal: phase === "lobby" && !partial.started }),
      channels: {
        public: partial.public || [],
      },
      window: windowOpen
        ? {
            open: true,
            maxLen: 160,
            submitted: partial.submitted ?? 3,
            youSubmitted: Boolean(partial.youSubmitted),
            yourDraft: partial.yourDraft ?? null,
          }
        : null,
      allowed: {
        say,
        act,
        setPhase: true,
        admin,
      },
      lobby: partial.lobby ?? {
        pairs: 2,
        seats: 8,
        theme: partial.started ? "Wild West" : null,
        selectedTheme: "wildWest",
        selectedThemeLabel: "Wild West",
        themes: THEMES,
        started: Boolean(partial.started),
      },
      meta: {
        cityPoints: partial.cityPoints ?? 0,
        slowdown: partial.slowdown ?? null,
        crisisPrompt: partial.crisisPrompt ?? null,
        votesCast: partial.votesCast ?? 0,
        votesNeeded: partial.votesNeeded ?? 7,
        youVoted: Boolean(partial.youVoted),
        yourVoteTarget: partial.yourVoteTarget ?? null,
        winner: partial.winner ?? null,
        ...(partial.meta || {}),
      },
    };
  }

  const STEPS = [
    {
      id: "lobby",
      label: "Lobby — theme picker, ADD BOT / START (demo data only)",
      view: () =>
        base({
          phase: "lobby",
          admin: ["addBot", "startGame", "setTheme", "resetGame", "resetRoom"],
          act: ["ready"],
          public: [town("Demo table only — no live players or model calls.")],
        }),
    },
    {
      id: "deal",
      label: "START — lore names dealt (hoods off in 3D)",
      view: () =>
        base({
          phase: "talk",
          started: true,
          admin: ["openWindow", "closeWindow", "setAlive", "resetGame", "resetRoom", "setPhase"],
          public: [
            town("The town opens under Wild West. Lore names are dealt. Kind stays hidden."),
            msg(1, "Opal Wren", "Somebody drank from the well after dark. Mud on the bucket, fresh."),
          ],
          cityPoints: 0,
        }),
    },
    {
      id: "blind",
      label: "Day talk — blind write OPEN (SUBMIT enabled)",
      view: () =>
        base({
          phase: "talk",
          started: true,
          windowOpen: true,
          submitted: 2,
          admin: ["closeWindow", "setAlive", "resetGame", "resetRoom", "setPhase"],
          act: ["submit"],
          public: [
            town("DAY 1. Blind talk — write one sealed line, then we reveal together."),
            msg(1, "Opal Wren", "Somebody drank from the well after dark."),
          ],
        }),
    },
    {
      id: "sealed",
      label: "You SUBMIT — sealed line waiting on table",
      view: () =>
        base({
          phase: "talk",
          started: true,
          windowOpen: true,
          submitted: 3,
          youSubmitted: true,
          yourDraft: "I saw dust on the well rope at dawn.",
          admin: ["closeWindow", "setPhase"],
          act: [],
          public: [
            town("DAY 1. Blind talk — write one sealed line, then we reveal together."),
          ],
        }),
    },
    {
      id: "reveal",
      label: "REVEAL — sealed lines on the record",
      view: () =>
        base({
          phase: "talk",
          started: true,
          admin: ["openWindow", "setPhase"],
          public: [
            town("Reveal: 4 sealed day line(s) hit the record. Crisis is next."),
            msg(YOU_SEAT, "Kitty Blaze", "I saw dust on the well rope at dawn."),
            msg(2, "Mara Flint", "The latch on the granary was loose."),
            msg(6, "Eliza Thorn", "Three lamps missing from my shelf."),
          ],
        }),
    },
    {
      id: "crisis",
      label: "Crisis — sealed answers (SUBMIT)",
      view: () =>
        base({
          phase: "crisis",
          started: true,
          windowOpen: true,
          submitted: 1,
          crisisPrompt: "The well is failing. What do we do before night?",
          admin: ["closeWindow", "setPhase"],
          act: ["submit"],
          public: [
            town("CRISIS: The well is failing. What do we do before night?"),
          ],
          meta: {
            cityPoints: 0,
            crisisPrompt: "The well is failing. What do we do before night?",
          },
        }),
    },
    {
      id: "crisis-done",
      label: "Crisis judged — city points updated",
      view: () =>
        base({
          phase: "crisis",
          started: true,
          admin: ["setPhase"],
          public: [
            town("Crisis judged (4 answers). The town steadies the well. City points: 2. Vote is next."),
          ],
          cityPoints: 2,
          meta: { cityPoints: 2, crisisPrompt: "The well is failing. What do we do before night?" },
        }),
    },
    {
      id: "vote",
      label: "Vote — click a guest in 3D (demo vote on seat 5)",
      view: () =>
        base({
          phase: "vote",
          started: true,
          admin: ["setPhase"],
          act: ["vote"],
          votesCast: 3,
          votesNeeded: 7,
          public: [
            town("VOTE. Click one living seat. Need 4 of 7 for a kick. Kind stays hidden."),
            msg(3, "Calico June", "Flint Hoyt keeps changing his story."),
          ],
          meta: {
            cityPoints: 2,
            votesCast: 3,
            votesNeeded: 7,
            youVoted: false,
          },
        }),
    },
    {
      id: "vote-cast",
      label: "Your vote locked — majority resolves",
      view: () =>
        base({
          phase: "vote",
          started: true,
          admin: ["setPhase"],
          act: [],
          youVoted: true,
          yourVoteTarget: 5,
          votesCast: 7,
          votesNeeded: 7,
          public: [
            town("VOTE. Click one living seat."),
            town("Flint Hoyt is voted out (4/7). Kind stays hidden. Checking the town…"),
          ],
          seats: seats({ dead: [5] }),
          meta: {
            cityPoints: 2,
            votesCast: 7,
            votesNeeded: 7,
            youVoted: true,
            yourVoteTarget: 5,
          },
        }),
    },
    {
      id: "night",
      label: "Night — chandelier dim, town waits",
      view: () =>
        base({
          phase: "night",
          started: true,
          admin: ["setPhase"],
          public: [
            town("NIGHT. Humans wait in the dark. Shadows meet in secret."),
          ],
          seats: seats({ dead: [5] }),
          meta: { cityPoints: 2 },
        }),
    },
    {
      id: "ended",
      label: "Game over — humans win (demo outcome)",
      view: () =>
        base({
          phase: "ended",
          started: true,
          admin: ["resetGame", "resetRoom"],
          public: [
            town("ENDED — humans win. No bots remain at the table."),
          ],
          seats: seats({ dead: [5, 0, 2] }),
          meta: { cityPoints: 2, winner: "humans" },
        }),
    },
  ];

  function pushState() {
    const step = STEPS[stepIndex];
    if (!step?.view) return;
    handlers.state?.({ view: step.view() });
    updateChrome(step);
    scheduleGuide(step);
  }

  function scheduleGuide(step) {
    const guide = step?.id ? window.DEMO_GUIDES?.[step.id] : null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.__demoShowGuide?.(guide || null);
      });
    });
  }

  function updateChrome(step) {
    const bar = document.getElementById("demo-bar");
    if (!bar) return;
    const title = bar.querySelector("[data-demo-step]");
    const count = bar.querySelector("[data-demo-count]");
    if (title) {
      title.textContent = inGame
        ? step?.label || "In game"
        : "Join — COME IN or use Enter demo, then NEXT STEP advances the script";
    }
    if (count) {
      count.textContent = inGame ? `${stepIndex + 1} / ${STEPS.length}` : "—";
    }
    const next = bar.querySelector("[data-demo-next]");
    if (next) next.disabled = stepIndex >= STEPS.length - 1;
    const back = bar.querySelector("[data-demo-back]");
    if (back) back.disabled = !inGame || stepIndex <= 0;
    renderObserver();
    if (!inGame) {
      requestAnimationFrame(() => window.__demoShowGuide?.(window.DEMO_GUIDES?.join));
    }
  }

  function renderObserver() {
    const panel = document.getElementById("demo-observer-body");
    if (!panel) return;
    if (!observerOn || !inGame || stepIndex < 1) {
      panel.innerHTML = "<p class=\"demo-muted\">Enable observer to see demo-only role labels (not shown on table).</p>";
      return;
    }
    panel.innerHTML = LORE_NAMES.map(
      (name, i) =>
        `<div><strong>${name}</strong> · seat ${i} · <span class="demo-tag">${OBSERVER_KIND[i]}</span></div>`
    ).join("");
  }

  function advance() {
    if (!inGame) {
      document.getElementById("join-btn")?.click();
      return;
    }
    if (stepIndex >= STEPS.length - 1) return;
    stepIndex += 1;
    pushState();
  }

  function retreat() {
    if (!inGame || stepIndex <= 0) return;
    stepIndex -= 1;
    pushState();
  }

  function resetDemo() {
    stepIndex = 0;
    inGame = false;
    try {
      localStorage.removeItem("grokmafia.session");
    } catch (_) {
      /* ignore */
    }
    const join = document.getElementById("join-screen");
    const game = document.getElementById("game");
    if (join && game) {
      join.hidden = false;
      game.hidden = true;
    }
    window.__demoHideGuide?.();
    updateChrome(STEPS[0]);
  }

  function installDemoWalkthrough() {
    const socket = {
      connected: true,
      on(event, fn) {
        handlers[event] = fn;
        return socket;
      },
      emit(event, payload, ack) {
        if (event === "join") {
          inGame = true;
          stepIndex = 0;
          const res = { ok: true, token: DEMO_TOKEN, seatId: YOU_SEAT, playerId: "demo-you" };
          saveSession(DEMO_TOKEN);
          ack?.(res);
          handlers.joined?.({ token: DEMO_TOKEN, seatId: YOU_SEAT });
          pushState();
          return;
        }
        if (event === "resume") {
          ack?.({ ok: false, message: "demo mode" });
          return;
        }
        if (event === "submit") {
          const step = STEPS[stepIndex];
          if (step?.id === "blind") {
            stepIndex = STEPS.findIndex((s) => s.id === "sealed");
            pushState();
          } else if (step?.id === "crisis") {
            stepIndex = STEPS.findIndex((s) => s.id === "crisis-done");
            pushState();
          }
          ack?.({ ok: true });
          return;
        }
        if (event === "act" && payload?.type === "vote") {
          stepIndex = STEPS.findIndex((s) => s.id === "vote-cast");
          pushState();
          ack?.({ ok: true });
          return;
        }
        if (event === "say" || event === "openWindow" || event === "closeWindow") {
          ack?.({ ok: true });
          return;
        }
        ack?.({ ok: true });
      },
    };

    window.io = () => socket;

    window.__demoAdvance = advance;
    window.__demoRetreat = retreat;
    window.__demoReset = resetDemo;

    document.addEventListener("DOMContentLoaded", () => {
      const bar = document.getElementById("demo-bar");
      bar?.querySelector("[data-demo-next]")?.addEventListener("click", advance);
      bar?.querySelector("[data-demo-back]")?.addEventListener("click", retreat);
      bar?.querySelector("[data-demo-reset]")?.addEventListener("click", resetDemo);
      bar?.querySelector("[data-demo-join]")?.addEventListener("click", () => {
        document.getElementById("join-btn")?.click();
      });
      bar?.querySelector("[data-demo-observer]")?.addEventListener("change", (e) => {
        observerOn = e.target.checked;
        renderObserver();
      });
      updateChrome(inGame ? STEPS[stepIndex] : null);
      queueMicrotask(() => handlers.connect?.());
    });
  }

  function saveSession(token) {
    try {
      localStorage.setItem("grokmafia.session", token);
    } catch (_) {
      /* ignore */
    }
  }

  window.installDemoWalkthrough = installDemoWalkthrough;
})();
