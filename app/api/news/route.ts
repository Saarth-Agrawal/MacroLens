type NewsArticle = { title: string; url: string; publisher: string; domain: string; date: string };

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
    signal: AbortSignal.timeout(4500),
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
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error(`GOOGLE_NEWS_HTTP_${response.status}`);
  return parseRss(await response.text());
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
  const query = body.query?.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 220);
  if (!query) return Response.json({ articles: [], provider: "none", limitation: "A search query is required." }, { status: 400, headers: responseHeaders });

  // These are the two providers already disclosed by MacroLens. Run them in
  // parallel so a temporary failure from one does not delay a usable result
  // from the other, while preserving the same data-sharing boundary.
  const providers = [["Google News RSS", "googleNews", fromGoogleNews], ["GDELT DOC 2.0", "gdelt", fromGdelt]] as const;
  const settled = await Promise.allSettled(providers.map(([, , load]) => load(query)));
  const diagnostics: Record<string, string> = {};
  for (const [index, outcome] of settled.entries()) {
    const [provider, diagnosticKey] = providers[index];
    if (outcome.status === "fulfilled") {
      diagnostics[diagnosticKey] = outcome.value.length ? "success" : "empty";
      if (outcome.value.length) return Response.json({ articles: outcome.value, provider, retrievalStatus: "live", evidenceDepth: "headline metadata only", diagnostics }, { headers: responseHeaders });
    } else {
      diagnostics[diagnosticKey] = diagnostic(outcome.reason);
    }
  }

  return Response.json({
    articles: [],
    provider: "offline",
    retrievalStatus: "unavailable",
    evidenceDepth: "none",
    diagnostics,
    limitation: "LIVE RETRIEVAL UNAVAILABLE. The public feeds did not return usable sources. No curated evidence has been substituted.",
  }, { headers: responseHeaders });
}
