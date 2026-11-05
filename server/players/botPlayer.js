const { cannedLines } = require("./prompts/sandbox");
const { cannedLine } = require("./personality");

/**
 * In-process BotPlayer — same say/act/submit path as humans.
 * Uses Grok when GROK_API_KEY is set; otherwise canned lines.
 * Pass existingPlayer when the seat was already created (e.g. host addBot).
 */
function startBotPlayer(room, { name = "Grok-1", intervalMs = 8000, existingPlayer } = {}) {
  const bot = existingPlayer || room.joinBot({ name });
  let lineIndex = 0;
  let busy = false;

  function personality() {
    return bot.meta?.personality || null;
  }

  function intervalForBot() {
    const p = personality();
    if (p?.speakDelayMs) {
      return Math.max(2500, Number(intervalMs) + (p.speakDelayMs % 3000));
    }
    return intervalMs;
  }

  async function maybeAct() {
    if (busy) return;
    const view = room.viewFor(bot.id);
    if (!view || !view.you.alive) return;

    if (
      view.phase === "night" &&
      view.meta?.nightStage === "vote" &&
      view.allowed.act.includes("shadowVote")
    ) {
      busy = true;
      try {
        const choice = await pickShadowVote(view);
        if (choice && choice.pass) {
          room.handleAct(bot.id, "shadowVote", { pass: true });
        } else if (choice && choice.seatId != null) {
          room.handleAct(bot.id, "shadowVote", { seatId: choice.seatId });
        }
      } catch (err) {
        console.warn("[bot]", bot.name, err.message);
      } finally {
        busy = false;
      }
      return;
    }

    if (
      view.phase === "night" &&
      view.allowed.say.includes("shadow") &&
      view.meta?.nightStage === "talk"
    ) {
      const msgs = view.channels.shadow || [];
      const last = msgs[msgs.length - 1];
      if (last && last.fromSeat === bot.seatId) return;
      busy = true;
      try {
        const text = await pickLine(view);
        if (text) room.handleSay(bot.id, "shadow", text);
      } catch (err) {
        console.warn("[bot]", bot.name, err.message);
      } finally {
        busy = false;
      }
      return;
    }

    if (view.phase === "vote" && view.allowed.act.includes("vote")) {
      busy = true;
      try {
        const target = await pickVoteTarget(view);
        if (target != null) {
          room.handleAct(bot.id, "vote", { seatId: target });
        }
      } catch (err) {
        console.warn("[bot]", bot.name, err.message);
      } finally {
        busy = false;
      }
      return;
    }

    if (view.window?.open) {
      if (view.window.youSubmitted) return;
      busy = true;
      try {
        const text = await pickLine(view);
        if (text) room.submit(bot.id, text);
      } catch (err) {
        console.warn("[bot]", bot.name, err.message);
      } finally {
        busy = false;
      }
      return;
    }

    if (view.phase !== "talk") return;
    if (!view.allowed.say.includes("public")) return;

    const msgs = view.channels.public || [];
    const last = msgs[msgs.length - 1];
    if (last && last.fromSeat === bot.seatId) return;

    busy = true;
    try {
      const text = await pickLine(view);
      if (text) room.handleSay(bot.id, "public", text);
    } catch (err) {
      console.warn("[bot]", bot.name, err.message);
    } finally {
      busy = false;
    }
  }

  /** Full visible public transcript for the model (trim oldest if huge). */
  function formatTranscript(view, maxChars = 24000) {
    const msgs = view.channels?.public || [];
    const lines = msgs.map((m) => {
      const seat =
        typeof m.fromSeat === "number" && m.fromSeat >= 0
          ? `#${m.fromSeat} `
          : "";
      return `${seat}${m.name}: ${m.text}`;
    });
    let text = lines.join("\n");
    if (text.length > maxChars) {
      text = text.slice(text.length - maxChars);
      const cut = text.indexOf("\n");
      if (cut > 0) text = text.slice(cut + 1);
      text = `[…earlier lines omitted…]\n${text}`;
    }
    return text;
  }

  function livingSeatList(view) {
    return (view.seats || [])
      .filter((s) => s.alive)
      .map((s) => `#${s.seatId} ${s.name}`)
      .join(", ");
  }

  async function pickShadowVote(view) {
    const humans = view.meta?.humanTargets || [];
    if (!humans.length) return { pass: true };
    function randomHuman() {
      return humans[Math.floor(Math.random() * humans.length)].seatId;
    }
    const key = process.env.GROK_API_KEY;
    if (!key) return { seatId: randomHuman() };
    try {
      const prompt = view.botPrompt || "Vote a human seat or PASS.";
      const shadow = (view.channels?.shadow || [])
        .slice(-12)
        .map((m) => `${m.name}: ${m.text}`)
        .join("\n");
      const list = humans.map((h) => `#${h.seatId} ${h.name}`).join(", ");
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: process.env.GROK_MODEL || "grok-2-latest",
          messages: [
            { role: "system", content: prompt },
            {
              role: "user",
              content:
                (shadow ? `Shadow chat:\n${shadow}\n\n` : "") +
                `Valid human targets: ${list}\n` +
                "Reply with ONLY a seat number or the word PASS.",
            },
          ],
          max_tokens: 20,
          temperature: 0.6,
        }),
      });
      if (!res.ok) throw new Error(`grok http ${res.status}`);
      const data = await res.json();
      const content = String(data.choices?.[0]?.message?.content || "");
      if (/pass/i.test(content)) return { pass: true };
      const match = content.match(/-?\d+/);
      const seatId = match ? Number(match[0]) : NaN;
      if (humans.some((h) => h.seatId === seatId)) return { seatId };
      return { seatId: randomHuman() };
    } catch (err) {
      console.warn("[bot] shadow vote fallback:", err.message);
      return { seatId: randomHuman() };
    }
  }

  async function pickVoteTarget(view) {
    const candidates = (view.seats || []).filter(
      (s) => s.alive && s.seatId !== view.you.seatId
    );
    if (!candidates.length) return null;

    function randomCandidate() {
      return candidates[Math.floor(Math.random() * candidates.length)].seatId;
    }

    const key = process.env.GROK_API_KEY;
    if (!key) {
      return randomCandidate();
    }
    try {
      const prompt = view.botPrompt || `Vote for a seat.`;
      const history = formatTranscript(view);
      const seats = livingSeatList(view);
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: process.env.GROK_MODEL || "grok-2-latest",
          messages: [
            { role: "system", content: prompt },
            {
              role: "user",
              content:
                (history
                  ? `Full town transcript so far:\n${history}\n\n`
                  : "No public transcript yet.\n\n") +
                `Living seats: ${seats || "(none)"}\n` +
                "Pick from suspicion in the transcript. Do not pile onto one seat every time. " +
                "Reply with ONLY the seat number integer to vote out.",
            },
          ],
          max_tokens: 20,
          temperature: 0.7,
        }),
      });
      if (!res.ok) throw new Error(`grok http ${res.status}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      const match = content.match(/-?\d+/);
      const seatId = match ? Number(match[0]) : NaN;
      if (candidates.some((c) => c.seatId === seatId)) return seatId;
      return randomCandidate();
    } catch (err) {
      console.warn("[bot] vote fallback:", err.message);
      return randomCandidate();
    }
  }

  function offlineLine(maxLen) {
    const p = personality();
    const line = p
      ? cannedLine(p, lineIndex)
      : cannedLines[lineIndex % cannedLines.length];
    lineIndex += 1;
    return String(line).slice(0, maxLen);
  }

  async function pickLine(view) {
    const key = process.env.GROK_API_KEY;
    const maxLen = view.window?.maxLen || 200;
    if (!key) {
      return offlineLine(maxLen);
    }
    try {
      const prompt = view.botPrompt || `You are ${bot.name}. Say something short.`;
      const history = formatTranscript(view);
      const seats = livingSeatList(view);
      const phase = view.phase || "talk";
      const metaBits = [];
      if (view.meta?.cityPoints != null) metaBits.push(`cityPoints=${view.meta.cityPoints}`);
      if (view.meta?.crisisPrompt) metaBits.push(`crisis=${view.meta.crisisPrompt}`);
      if (view.meta?.talkPrompt) metaBits.push(`dayPrompt=${view.meta.talkPrompt}`);
      const contextHeader =
        `Phase: ${phase}. You are seat #${view.you.seatId} (${view.you.name}). ` +
        `Living seats: ${seats || "(none)"}.` +
        (metaBits.length ? ` ${metaBits.join(" · ")}.` : "");
      const blind = Boolean(view.window?.open);
      const temp = Number(personality()?.temperature);
      const temperature = Number.isFinite(temp) ? temp : 0.9;
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: process.env.GROK_MODEL || "grok-2-latest",
          messages: [
            { role: "system", content: prompt },
            {
              role: "user",
              content: blind
                ? history
                  ? `${contextHeader}\n\nFull town transcript so far (others are writing blind now):\n${history}\n\nWrite your one blind line only.`
                  : `${contextHeader}\n\nNo transcript yet. Write one short blind line for the table.`
                : history
                  ? `${contextHeader}\n\nFull town transcript so far:\n${history}\n\nWrite your next message only.`
                  : `${contextHeader}\n\nThe chat is empty. Say a short hello to the table.`,
            },
          ],
          max_tokens: 60,
          temperature,
        }),
      });
      if (!res.ok) throw new Error(`grok http ${res.status}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("empty grok");
      return content.replace(/^["']|["']$/g, "").slice(0, maxLen);
    } catch (err) {
      console.warn("[bot] grok fallback:", err.message);
      return offlineLine(maxLen);
    }
  }

  const timer = setInterval(maybeAct, intervalForBot());
  const kickDelay = personality()?.speakDelayMs || 1500;
  const kick = setTimeout(maybeAct, kickDelay);

  return {
    player: bot,
    stop() {
      clearInterval(timer);
      clearTimeout(kick);
    },
  };
}

module.exports = { startBotPlayer };
