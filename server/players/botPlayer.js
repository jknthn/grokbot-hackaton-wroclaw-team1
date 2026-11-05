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
    if (p?.speakDelayMs) return Math.max(2500, Number(intervalMs) + (p.speakDelayMs % 3000));
    return intervalMs;
  }

  async function maybeSpeak() {
    if (busy) return;
    const view = room.viewFor(bot.id);
    if (!view || !view.you.alive) return;

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

  function offlineLine(maxLen) {
    const p = personality();
    const line = p ? cannedLine(p, lineIndex) : cannedLines[lineIndex % cannedLines.length];
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
      const history = (view.channels.public || [])
        .slice(-12)
        .map((m) => `${m.name}: ${m.text}`)
        .join("\n");
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
                  ? `Earlier transcript (others are writing blind now):\n${history}\n\nWrite your one blind line only.`
                  : "Write one short blind line for the table. Nobody else can see it yet."
                : history
                  ? `Recent chat:\n${history}\n\nWrite your next message only.`
                  : "The chat is empty. Say a short hello to the table.",
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

  const timer = setInterval(maybeSpeak, intervalForBot());
  const kickDelay = personality()?.speakDelayMs || 1500;
  const kick = setTimeout(maybeSpeak, kickDelay);

  return {
    player: bot,
    stop() {
      clearInterval(timer);
      clearTimeout(kick);
    },
  };
}

module.exports = { startBotPlayer };
