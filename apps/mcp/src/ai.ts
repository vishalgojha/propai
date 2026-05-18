type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ThreadSummary = {
  summary: string;
  next_action: string;
  key_points: string[];
};

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

function fallbackSummary(lines: string[]): ThreadSummary {
  const recent = lines.slice(-5);
  return {
    summary: recent.length
      ? `Recent thread activity captured across ${recent.length} messages.`
      : "No meaningful thread history found.",
    next_action: recent.length
      ? "Review the latest asks, confirm availability, and send the broker a concise follow-up."
      : "Ask the broker to load or sync more thread history before summarizing.",
    key_points: recent,
  };
}

async function callOpenAICompatible(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  extraHeaders?: Record<string, string>,
) {
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return String(data.choices?.[0]?.message?.content || "").trim();
}

function parseSummary(raw: string, fallback: ThreadSummary) {
  try {
    const parsed = JSON.parse(raw) as Partial<ThreadSummary>;
    const summary = String(parsed.summary || "").trim();
    const nextAction = String(parsed.next_action || "").trim();
    const keyPoints = Array.isArray(parsed.key_points)
      ? parsed.key_points.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
      : [];

    if (!summary || !nextAction || !keyPoints.length) {
      return fallback;
    }

    return {
      summary,
      next_action: nextAction,
      key_points: keyPoints,
    };
  } catch {
    return fallback;
  }
}

export async function summarizeBrokerThreadWithLlm(input: {
  remoteJid: string;
  lines: string[];
}) {
  const fallback = fallbackSummary(input.lines);
  if (!input.lines.length) return fallback;

  const systemPrompt = [
    "You summarize Indian real estate broker WhatsApp threads for an operator.",
    "Return strict JSON with keys: summary, next_action, key_points.",
    "key_points must be an array of up to 5 concise bullets without numbering.",
    "Mention commitments, budget/location cues, availability cues, and the strongest next step.",
  ].join(" ");

  const userPrompt = [
    `Chat JID: ${input.remoteJid}`,
    "Summarize this broker thread:",
    input.lines.join("\n"),
  ].join("\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const openRouterKey = process.env.OPENROUTER_API_KEY || "";
  if (openRouterKey) {
    try {
      const raw = await callOpenAICompatible(
        OPENROUTER_BASE_URL,
        openRouterKey,
        OPENROUTER_MODEL,
        messages,
        {
          "HTTP-Referer": "https://mcp.propai.live",
          "X-Title": "PropAI MCP",
        },
      );
      return parseSummary(raw, fallback);
    } catch {
      // Fall through to the next provider.
    }
  }

  const groqKey = process.env.GROQ_API_KEY || "";
  if (groqKey) {
    try {
      const raw = await callOpenAICompatible(
        GROQ_BASE_URL,
        groqKey,
        GROQ_MODEL,
        messages,
      );
      return parseSummary(raw, fallback);
    } catch {
      // Fall through to the heuristic fallback.
    }
  }

  return fallback;
}
