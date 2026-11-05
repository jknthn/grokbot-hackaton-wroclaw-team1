/**
 * GM narration helpers — theme pick + short prompts.
 * LLM when GROK_API_KEY is set; canned fallback otherwise.
 */

const lore = require("../lore");
const { TALK_PROMPTS, CRISIS_PROMPTS } = require("../rules/town");

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

function fallbackTalk(index = 0) {
  return TALK_PROMPTS[index % TALK_PROMPTS.length];
}

function fallbackCrisis(index = 0) {
  return CRISIS_PROMPTS[index % CRISIS_PROMPTS.length];
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
  const content = await callGrok(
    [
      {
        role: "system",
        content:
          "Write one short day prompt for townsfolk (under 20 words). " +
          'Reply ONLY JSON: {"prompt":"..."}',
      },
      {
        role: "user",
        content: `Theme: ${themeLabel || "town"}. Ask them to reveal suspicion or alliance in one line.`,
      },
    ],
    opts
  );
  const parsed = parseJson(content);
  const prompt = String(parsed?.prompt || "").trim();
  if (prompt) return prompt.slice(0, 160);
  return fallbackTalk(opts.index || 0);
}

async function writeCrisisPrompt(themeLabel, opts = {}) {
  const content = await callGrok(
    [
      {
        role: "system",
        content:
          "Write one short town crisis question (under 25 words). Soft stakes only — nobody dies from the answer. " +
          'Reply ONLY JSON: {"prompt":"..."}',
      },
      {
        role: "user",
        content: `Theme: ${themeLabel || "town"}.`,
      },
    ],
    opts
  );
  const parsed = parseJson(content);
  const prompt = String(parsed?.prompt || "").trim();
  if (prompt) return prompt.slice(0, 200);
  return fallbackCrisis(opts.index || 0);
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
