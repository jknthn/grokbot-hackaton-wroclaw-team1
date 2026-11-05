const { cannedLines } = require("./prompts/sandbox");

/**
 * In-process BotPlayer — same say/act path as humans.
 * Uses Grok when GROK_API_KEY is set; otherwise canned lines.
 */
function startBotPlayer(room, { name = "Grok-1", intervalMs = 8000 } = {}) {
  const bot = room.joinBot({ name });
  let lineIndex = 0;
  let busy = false;

  async function maybeSpeak() {
    if (busy) return;
    const view = room.viewFor(bot.id);
    if (!view || view.phase !== "talk") return;
    if (!view.allowed.say.includes("public")) return;

    const msgs = view.channels.public || [];
    const last = msgs[msgs.length - 1];
    if (last && last.fromSeat === bot.seatId) return;
    // In lobby→talk, speak once even if chat empty; otherwise wait for human traffic or speak if empty after tick
    if (msgs.length === 0) {
      // still allow intro line
    }

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

  async function pickLine(view) {
    const key = process.env.GROK_API_KEY;
    if (!key) {
      const line = cannedLines[lineIndex % cannedLines.length];
      lineIndex += 1;
      return line;
    }
    try {
      const prompt = view.botPrompt || `You are ${bot.name}. Say something short.`;
      const history = (view.channels.public || [])
        .slice(-12)
        .map((m) => `${m.name}: ${m.text}`)
        .join("\n");
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
              content: history
                ? `Recent chat:\n${history}\n\nWrite your next message only.`
                : "The chat is empty. Say a short hello to the table.",
            },
          ],
          max_tokens: 60,
          temperature: 0.9,
        }),
      });
      if (!res.ok) throw new Error(`grok http ${res.status}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("empty grok");
      return content.replace(/^["']|["']$/g, "").slice(0, 200);
    } catch (err) {
      console.warn("[bot] grok fallback:", err.message);
      const line = cannedLines[lineIndex % cannedLines.length];
      lineIndex += 1;
      return line;
    }
  }

  // First attempt shortly after talk starts; then interval
  const timer = setInterval(maybeSpeak, intervalMs);
  const kick = setTimeout(maybeSpeak, 1500);

  return {
    player: bot,
    stop() {
      clearInterval(timer);
      clearTimeout(kick);
    },
  };
}

module.exports = { startBotPlayer };
