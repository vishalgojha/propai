type AiJsonOptions = {
  prompt: string;
  system: string;
};

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GOOGLE_MODEL = process.env.MCP_GEMINI_MODEL || "gemini-2.5-flash";
const OPENAI_MODEL = process.env.MCP_OPENAI_MODEL || "gpt-4o-mini";

async function callGeminiJson<T>({ prompt, system }: AiJsonOptions): Promise<T> {
  if (!GOOGLE_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${GOOGLE_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: system }],
      },
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return JSON.parse(text) as T;
}

async function callOpenAIJson<T>({ prompt, system }: AiJsonOptions): Promise<T> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI returned an empty response");
  }

  return JSON.parse(text) as T;
}

export async function generateAiJson<T>(options: AiJsonOptions): Promise<T> {
  try {
    return await callGeminiJson<T>(options);
  } catch (geminiError) {
    if (!OPENAI_API_KEY) {
      throw geminiError;
    }
    return callOpenAIJson<T>(options);
  }
}
