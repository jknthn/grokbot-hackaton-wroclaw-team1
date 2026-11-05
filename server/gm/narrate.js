/**
 * GM narration helpers — theme pick + short prompts.
 * LLM when GROK_API_KEY is set; theme-native canned fallback otherwise.
 */

const lore = require("../lore");

function parseJson(raw) {
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function fallbackTheme(themes) {
  const list = themes?.length ? themes : lore.listThemes();
  return list[Math.floor(Math.random() * list.length)]?.id || lore.DEFAULT_THEME;
}

function fallbackTalk(index = 0, themeId) {
  return lore.pickTalkPrompt(themeId || lore.DEFAULT_THEME, index);
}

function fallbackCrisis(index = 0, themeId) {
  return lore.pickCrisisPrompt(themeId || lore.DEFAULT_THEME, index);
}

function clipRecent(recent, maxChars = 600) {
  const text = String(recent || "").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}

async function callGrok(messages, opts = {}) {
  const key = opts.apiKey !== undefined ? opts.apiKey : process.env.GROK_API_KEY;
  if (!key) return null;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;
  try {
    const res = await fetchImpl("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: opts.model || process.env.GROK_MODEL || "grok-2-latest",
        temperature: 0.7,
        messages,
        max_tokens: 120,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

async function pickTheme(themes, opts = {}) {
  const list = themes?.length ? themes : lore.listThemes();
  const ids = list.map((t) => t.id);
  const content = await callGrok(
    [
      {
        role: "system",
        content:
          "Pick one theme id for a social-deduction town game. " +
          'Reply ONLY JSON: {"themeId":"..."}',
      },
      {
        role: "user",
        content: `Themes: ${JSON.stringify(list)}`,
      },
    ],
    opts
  );
  const parsed = parseJson(content);
  if (parsed?.themeId && ids.includes(parsed.themeId)) return parsed.themeId;
  return fallbackTheme(list);
}

async function writeTalkPrompt(themeLabel, opts = {}) {
  const themeId = opts.themeId || lore.DEFAULT_THEME;
  const day = Number(opts.day) || 1;
  const recent = clipRecent(opts.recent);
  const content = await callGrok(
    [
      {
        role: "system",
        content:
          "Write one short day prompt for townsfolk (under 20 words). " +
          "Force suspicion, alliance, or accusation in one line. Stay on theme. " +
          'Reply ONLY JSON: {"prompt":"..."}',
      },
      {
        role: "user",
        content:
          `Theme: ${themeLabel || "town"} (${themeId}). Day ${day}.` +
          (recent ? `\nRecent public lines:\n${recent}` : "") +
          "\nAsk them to reveal suspicion or alliance in one line.",
      },
    ],
    opts
  );
  const parsed = parseJson(content);
  const prompt = String(parsed?.prompt || "").trim();
  if (prompt) return prompt.slice(0, 160);
  return fallbackTalk(opts.index || 0, themeId);
}

async function writeCrisisPrompt(themeLabel, opts = {}) {
  const themeId = opts.themeId || lore.DEFAULT_THEME;
  const day = Number(opts.day) || 1;
  const recent = clipRecent(opts.recent);
  const content = await callGrok(
    [
      {
        role: "system",
        content:
          "Write one short town crisis question (under 25 words). Soft stakes only — nobody dies from the answer. " +
          "Stay on theme. If you mention rumors, list them concretely in the question. " +
          'Reply ONLY JSON: {"prompt":"..."}',
      },
      {
        role: "user",
        content:
          `Theme: ${themeLabel || "town"} (${themeId}). Day ${day}.` +
          (recent
            ? `\nRecent public lines (react to 1–2 if useful):\n${recent}`
            : "") +
          "\nAsk one concrete town problem the table must answer in one line each.",
      },
    ],
    opts
  );
  const parsed = parseJson(content);
  const prompt = String(parsed?.prompt || "").trim();
  if (prompt) return prompt.slice(0, 200);
  return fallbackCrisis(opts.index || 0, themeId);
}

module.exports = {
  pickTheme,
  writeTalkPrompt,
  writeCrisisPrompt,
  fallbackTheme,
  fallbackTalk,
  fallbackCrisis,
  parseJson,
};
