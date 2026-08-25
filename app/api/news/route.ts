export type NewsArticle = { title: string; url: string; publisher: string; domain: string; date: string; excerpt?: string; bodyRead?: boolean };
export type ResearchClaim = { id: string; text: string; category: "Event" | "Cause" | "Consequence" | "Causal hypothesis" };
type ResearchPlan = { framing: string; claims: ResearchClaim[]; queries: string[] };

const responseHeaders = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
  "X-Content-Type-Options": "nosniff",
  "X-MacroLens-Source-Depth": "headline-metadata-only",
};

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function tag(item: string, name: string) {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function safeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normaliseDate(value: string) {
  if (/^\d{8}/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? "Date unavailable" : new Date(parsed).toISOString().slice(0, 10);
}

function parseRss(xml: string): NewsArticle[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8).map((match) => {
    const item = match[1];
    const sourceTag = item.match(/<source(?:\s+url="([^"]+)")?[^>]*>([\s\S]*?)<\/source>/i);
    const sourceUrl = sourceTag?.[1] ? decodeXml(sourceTag[1]) : "";
    const publisher = sourceTag?.[2] ? decodeXml(sourceTag[2]) : "News publisher";
    let domain = publisher;
    if (sourceUrl) {
      try { domain = new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { /* keep publisher */ }
    }
    return {
      title: tag(item, "title").replace(/\s+-\s+[^-]+$/, "").slice(0, 240),
      url: safeWebUrl(tag(item, "link")),
      publisher: publisher.slice(0, 100),
      domain: domain.slice(0, 100),
      date: normaliseDate(tag(item, "pubDate")),
    };
  }).filter((article) => article.title && article.url);
}

async function fromGdelt(query: string): Promise<NewsArticle[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=8&format=json&sort=datedesc&timespan=1month`;
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "MacroLens-competition-prototype/4.0" },
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`GDELT_HTTP_${response.status}`);
  const payload = await response.json() as { articles?: Array<{ title?: string; url?: string; domain?: string; seendate?: string }> };
  return (payload.articles ?? []).slice(0, 8).map((article) => ({
    title: (article.title || "").trim().slice(0, 240),
    url: safeWebUrl(article.url || ""),
    publisher: (article.domain || "News publisher").slice(0, 100),
    domain: (article.domain || "News publisher").slice(0, 100),
    date: normaliseDate(article.seendate || ""),
  })).filter((article) => article.title && article.url);
}

async function fromGoogleNews(query: string): Promise<NewsArticle[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (compatible; MacroLens/4.0; school competition research prototype)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`GOOGLE_NEWS_HTTP_${response.status}`);
  return parseRss(await response.text());
}

export type TavilyResult = { title?: string; url?: string; content?: string; raw_content?: string; published_date?: string };

export function articleFromTavilyResult(item: TavilyResult): NewsArticle | undefined {
  const url = safeWebUrl(item.url || "");
  const title = (item.title || "").trim().slice(0, 240);
  if (!url || !title) return undefined;
  let domain = "Source publisher";
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* validated above */ }
  const rawContent = (item.raw_content || "").replace(/\s+/g, " ").trim();
  const searchSnippet = (item.content || "").replace(/\s+/g, " ").trim();
  const sourceText = rawContent || searchSnippet;
  return {
    title,
    url,
    publisher: domain,
    domain,
    date: normaliseDate(item.published_date || ""),
    // Tavily `content` is a relevance snippet. Only `raw_content` proves that
    // enough of the source page was actually read for stance classification.
    bodyRead: rawContent.length >= 180,
    excerpt: sourceText.slice(0, 1400) || undefined,
  };
}

async function fromTavily(query: string, apiKey: string): Promise<NewsArticle[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      topic: "general",
      search_depth: "basic",
      chunks_per_source: 2,
      // Two full-text results consistently complete inside the hosted worker's
      // request window while still allowing independent-source corroboration.
      max_results: 2,
      include_answer: false,
      include_raw_content: "text",
      include_images: false,
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`TAVILY_HTTP_${response.status}`);
  const payload = await response.json() as { results?: TavilyResult[] };
  return (payload.results ?? []).slice(0, 2).flatMap((item) => {
    const article = articleFromTavilyResult(item);
    return article ? [article] : [];
  });
}

async function planResearch(headline: string, apiKey: string): Promise<ResearchPlan> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "You are MacroLens' research planner. Decompose the submitted headline into complete, neutral, independently researchable claims. Then produce targeted web-search queries that will find primary evidence, independent reporting, the proposed causal mechanism or economic consequence, and counter-evidence. Preserve names, places, dates and quantities exactly. Do not answer or analyse the headline. Do not create generic queries." }] },
      contents: [{ role: "user", parts: [{ text: headline }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1600,
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: {
          framing: { type: "STRING" },
          claims: { type: "ARRAY", minItems: 1, maxItems: 6, items: { type: "OBJECT", properties: { id: { type: "STRING" }, text: { type: "STRING" }, category: { type: "STRING", enum: ["Event", "Cause", "Consequence", "Causal hypothesis"] } }, required: ["id", "text", "category"] } },
          queries: { type: "ARRAY", minItems: 3, maxItems: 4, items: { type: "STRING" } },
        }, required: ["framing", "claims", "queries"] },
      },
    }),
  });
  if (!response.ok) throw new Error(`GEMINI_RESEARCH_HTTP_${response.status}`);
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) throw new Error("GEMINI_RESEARCH_EMPTY");
  const raw = JSON.parse(text) as Partial<ResearchPlan>;
  const categories = new Set(["Event", "Cause", "Consequence", "Causal hypothesis"]);
  const claims = (raw.claims ?? []).slice(0, 6).flatMap((item, index) => {
    const claimText = String(item?.text || "").replace(/\s+/g, " ").trim().slice(0, 500);
    const category = String(item?.category || "");
    return claimText && categories.has(category) ? [{ id: `C${index + 1}`, text: claimText, category: category as ResearchClaim["category"] }] : [];
  });
  const queries = [...new Set((raw.queries ?? []).map((query) => String(query).replace(/[^\p{L}\p{N}\s'".-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 280)).filter(Boolean))].slice(0, 4);
  if (!claims.length || queries.length < 3) throw new Error("GEMINI_RESEARCH_INVALID");
  return { framing: String(raw.framing || "").trim().slice(0, 700), claims, queries };
}

function diagnostic(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && /_HTTP_\d+/.test(error.message)) return error.message.toLowerCase();
  return "fetch_failed";
}

export async function POST(request: Request) {
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > 2048) return Response.json({ articles: [], provider: "none", limitation: "Request too large." }, { status: 413, headers: responseHeaders });

  let body: { query?: string };
  try { body = await request.json(); } catch { return Response.json({ articles: [], provider: "none", limitation: "Invalid request." }, { status: 400, headers: responseHeaders }); }
  const rawQuery = body.query?.trim().slice(0, 500) || "";
  if (!rawQuery) return Response.json({ articles: [], provider: "none", limitation: "A search query is required." }, { status: 400, headers: responseHeaders });
  const tavilyKey = process.env.TAVILY_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!tavilyKey || !geminiKey) return Response.json({ articles: [], provider: "unavailable", limitation: "Gemini-planned Tavily research is not configured." }, { status: 503, headers: responseHeaders });
  try {
    const researchPlan = await planResearch(rawQuery, geminiKey);
    const outcomes = await Promise.allSettled(researchPlan.queries.map((query) => fromTavily(query, tavilyKey)));
    const seen = new Set<string>();
    const articles = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? outcome.value : []).filter((article) => {
      const key = article.url.replace(/#.*$/, "").replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
    if (!articles.length) throw new Error("TAVILY_RESEARCH_EMPTY");
    const hasPublicArticleText = articles.some((article) => article.bodyRead);
    return Response.json({ articles, researchPlan, provider: "Gemini-planned Tavily research", retrievalStatus: "live", evidenceDepth: hasPublicArticleText ? "public article text plus metadata" : "headline metadata only", diagnostics: { geminiResearchPlanner: "success", tavilyQueries: `${outcomes.filter((outcome) => outcome.status === "fulfilled").length}/${outcomes.length} completed` } }, { headers: { ...responseHeaders, "X-MacroLens-Source-Depth": hasPublicArticleText ? "public-article-text" : "headline-metadata-only" } });
  } catch (error) {
    return Response.json({ articles: [], provider: "unavailable", retrievalStatus: "unavailable", evidenceDepth: "none", diagnostics: { geminiTavilyResearch: diagnostic(error) }, limitation: "Gemini could not complete the Tavily research plan. No rule-based or curated sources were substituted." }, { status: 502, headers: responseHeaders });
  }
}
