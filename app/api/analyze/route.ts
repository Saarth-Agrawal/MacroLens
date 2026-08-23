type SourceInput = {
  id: string;
  title: string;
  domain: string;
  role: string;
  relationship: string;
};

type GeneratedNode = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  tone: "signal" | "mechanism" | "impact" | "watch";
};

type GeneratedAnalysis = {
  framing: string;
  confidenceNote: string;
  keyClaim: string;
  nodes: GeneratedNode[];
  winners: string[];
  losers: string[];
  watch: string[];
};

const schema = {
  type: "OBJECT",
  properties: {
    framing: { type: "STRING" },
    confidenceNote: { type: "STRING" },
    keyClaim: { type: "STRING" },
    nodes: {
      type: "ARRAY",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          eyebrow: { type: "STRING" },
          title: { type: "STRING" },
          body: { type: "STRING" },
          tone: { type: "STRING", enum: ["signal", "mechanism", "impact", "watch"] },
        },
        required: ["id", "eyebrow", "title", "body", "tone"],
      },
    },
    winners: { type: "ARRAY", minItems: 3, maxItems: 3, items: { type: "STRING" } },
    losers: { type: "ARRAY", minItems: 3, maxItems: 3, items: { type: "STRING" } },
    watch: { type: "ARRAY", minItems: 4, maxItems: 4, items: { type: "STRING" } },
  },
  required: ["framing", "confidenceNote", "keyClaim", "nodes", "winners", "losers", "watch"],
};

function isGeneratedAnalysis(value: unknown): value is GeneratedAnalysis {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GeneratedAnalysis>;
  return typeof item.framing === "string" && typeof item.confidenceNote === "string" && typeof item.keyClaim === "string" && Array.isArray(item.nodes) && item.nodes.length === 5 && Array.isArray(item.winners) && item.winners.length === 3 && Array.isArray(item.losers) && item.losers.length === 3 && Array.isArray(item.watch) && item.watch.length === 4;
}

export async function POST(request: Request) {
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > 12_000) return Response.json({ available: false, reason: "Request too large." }, { status: 413 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ available: false, reason: "AI synthesis is not configured; transparent causal-engine fallback used." }, { status: 503 });

  let body: { headline?: string; language?: string; sources?: SourceInput[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ available: false, reason: "Invalid request." }, { status: 400 });
  }

  const headline = body.headline?.trim().slice(0, 500);
  if (!headline) return Response.json({ available: false, reason: "A headline is required." }, { status: 400 });
  const language = ["English", "हिन्दी", "मराठी"].includes(body.language || "") ? body.language : "English";
  const sources = (body.sources ?? []).slice(0, 8).map((source) => `${String(source.id || "S?").slice(0, 12)}: ${String(source.title || "Untitled source").slice(0, 240)} — ${String(source.domain || "Unknown publisher").slice(0, 100)} [${String(source.role || "Unclassified").slice(0, 40)}; ${String(source.relationship || "Unclassified").slice(0, 40)}]`).join("\n");

  const prompt = `You are the causal-hypothesis layer inside MacroLens, a school competition prototype.\n\nHeadline: ${headline}\nOutput language: ${language}\nEvidence catalogue (titles and metadata only; you have not read the full articles):\n${sources || "No sources retrieved."}\n\nCreate a concise five-step chain: signal, transmission mechanism, hidden dependency, India-specific impact, and what to watch. This is not a summary. Never invent a statistic, quotation, date, named person's view or detail not present above. Treat the chain as testable hypotheses, not verified fact. Explicitly say what could break the chain. Keep each body under 38 words, each title under 8 words, and all output in the requested language. The winners/losers are potentially affected groups, not predictions. Do not claim that a source supports a causal link merely because its title is related.`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schema },
      }),
    });
    if (!response.ok) return Response.json({ available: false, reason: `AI provider returned ${response.status}; fallback used.` }, { status: 502 });
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return Response.json({ available: false, reason: "AI provider returned no structured analysis; fallback used." }, { status: 502 });
    const analysis = JSON.parse(text);
    if (!isGeneratedAnalysis(analysis)) return Response.json({ available: false, reason: "AI output failed validation; fallback used." }, { status: 502 });
    return Response.json({ available: true, analysis });
  } catch {
    return Response.json({ available: false, reason: "AI synthesis was unavailable; fallback used." }, { status: 502 });
  }
}
