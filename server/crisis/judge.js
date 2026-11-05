/**
 * LLM crisis judge — soft city points / slowdown, never kills.
 * Falls back offline when GROK_API_KEY is missing or the call fails.
 */

function fallbackJudge({ answers = [], livingCount } = {}) {
  const living = Math.max(1, Number(livingCount) || answers.length || 1);
  const solid = answers.filter((a) => String(a?.text ?? "").trim().length >= 20);
  const helped = solid.length >= Math.ceil(living / 2);
  return {
    helped,
    pointsDelta: helped ? 1 : 0,
    slowdown: helped ? "favor" : "against",
    summary: helped
      ? "The town's answers held. Soft favor to the city."
      : "The crisis answers fell short. Soft against the city.",
  };
}

function parseJudgeJson(raw) {
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

function normalizeResult(parsed, fallback) {
  if (!parsed || typeof parsed !== "object") return fallback;
  const helped = Boolean(parsed.helped);
  let pointsDelta = Number(parsed.pointsDelta);
  if (!Number.isFinite(pointsDelta)) pointsDelta = helped ? 1 : 0;
  pointsDelta = Math.max(0, Math.min(2, Math.round(pointsDelta)));
  let slowdown = parsed.slowdown;
  if (slowdown !== "favor" && slowdown !== "against") {
    slowdown = helped ? "favor" : "against";
  }
  const summary =
    String(parsed.summary || "").trim().slice(0, 200) || fallback.summary;
  return { helped, pointsDelta, slowdown, summary };
}

/**
 * @param {{ prompt: string, answers: Array<{ name: string, text: string }>, livingCount: number }} input
 * @param {{ apiKey?: string|null, fetchImpl?: typeof fetch, model?: string }} [opts]
 */
async function judge(input, opts = {}) {
  const fallback = fallbackJudge(input);
  const key =
    opts.apiKey !== undefined ? opts.apiKey : process.env.GROK_API_KEY;
  if (!key) return fallback;

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return fallback;

  const prompt = String(input.prompt || "").trim();
  const lines = (input.answers || [])
    .map((a) => `${a.name}: ${a.text}`)
    .join("\n");

  try {
    const res = await fetchImpl("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: opts.model || process.env.GROK_MODEL || "grok-2-latest",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You judge whether a town's crisis answers helped. " +
              "Reply with ONLY JSON: " +
              '{"helped":boolean,"pointsDelta":0|1|2,"slowdown":"favor"|"against","summary":"one short sentence"}. ' +
              "Nobody dies. Soft outcome only.",
          },
          {
            role: "user",
            content: `Crisis prompt:\n${prompt}\n\nAnswers:\n${lines || "(none)"}`,
          },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return normalizeResult(parseJudgeJson(content), fallback);
  } catch {
    return fallback;
  }
}

module.exports = { judge, fallbackJudge, parseJudgeJson };
