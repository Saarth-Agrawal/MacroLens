import type { AnalysisResult, Claim, ClaimCategory, EvidenceRole, EvidenceSource, SourceType } from "../data/demoCases";

export type DetectedLanguage = "English" | "Hindi" | "Marathi";
export type RetrievedArticle = { title: string; url: string; publisher: string; domain: string; date: string; excerpt?: string; bodyRead?: boolean };

const stopWords = new Set([
  "the", "a", "an", "and", "or", "as", "after", "because", "amid", "following", "due", "to", "of", "in", "on", "for", "with", "at", "by",
  "की", "का", "के", "से", "में", "और", "बाद", "मुळे", "नंतर", "मध्ये", "आणि", "चा", "ची", "चे",
]);

export function detectLanguage(text: string): DetectedLanguage {
  if (!/[\u0900-\u097f]/u.test(text)) return "English";
  const marathiSignals = /[ळॲ]|आहे|आणि|मध्ये|मुळे|नंतर|झाली|झाला|ठेवली|कायम|दरम्यान/u;
  return marathiSignals.test(text) ? "Marathi" : "Hindi";
}

function sentence(text: string) {
  const clean = text.trim().replace(/[.!?।]+$/u, "");
  if (!clean) return "";
  return `${clean.charAt(0).toLocaleUpperCase()}${clean.slice(1)}.`;
}

const finiteVerbPattern = /\b(?:is|are|was|were|has|have|had|will|would|can|could|may|might|must|keeps?|holds?|raises?|cuts?|falls?|rises?|climbs?|drops?|weakens?|strengthens?|disrupts?|delays?|surges?|slows?|accelerates?|expands?|contracts?|retreats?|sells?|buys?|approves?|rejects?|announces?|reports?|warns?|plans?|projects?|expects?|misses?|beats?|disappoints?|occurs?|happens?)\b/i;

function completeOccurrence(fragment: string) {
  const clean = fragment.trim().replace(/^[,;:\-–—]+|[,;:\-–—]+$/g, "");
  if (!clean) return "";
  if (finiteVerbPattern.test(clean) || /[\u0900-\u097f]/u.test(clean)) return sentence(clean);
  const lower = clean.toLocaleLowerCase();
  const determiner = /^(?:a|an|the|this|that|these|those)\b/i.test(clean) ? "" : /^[aeiou]/i.test(lower) ? "An " : "A ";
  return sentence(`${determiner}${lower} occurred`);
}

function consequenceSentence(fragment: string) {
  const clean = fragment.trim().replace(/^[,;:\-–—]+|[,;:\-–—]+$/g, "");
  const direction = clean.match(/^(.+?)\s+(higher|up|lower|down)$/i);
  if (direction) return sentence(`${direction[1]} may ${/higher|up/i.test(direction[2]) ? "rise" : "fall"}`);
  return finiteVerbPattern.test(clean) ? sentence(clean) : sentence(`The reported consequence was ${clean}`);
}

function claim(id: string, text: string, category: ClaimCategory, kind: Claim["kind"] = "Unverified claim"): Claim {
  return { id, text, category, kind, evidenceIds: [] };
}

export function decomposeHeadline(headline: string): Claim[] {
  const clean = headline.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const amountExplainer = clean.match(/^\$?([\d,.]+)\s*(trillion|billion|million)\b[^:—-]*[:—-]\s*(.+?)(?:'s|’s)\s+(debt)\b/i);
  if (amountExplainer) {
    const [, amount, scale, country, subject] = amountExplainer;
    return [claim("C1", `${country.trim()}'s ${subject.toLowerCase()} is about $${amount} ${scale.toLowerCase()}.`, "Event")];
  }

  const english = clean.match(/^(.+?)\s+(after|because|as|amid|following|due to)\s+(.+)$/i);
  if (english) {
    const [, event, , cause] = english;
    const eventText = sentence(event);
    const causeText = completeOccurrence(cause);
    return [
      claim("C1", eventText, "Event"),
      claim("C2", causeText, "Cause"),
      claim("C3", `The headline proposes that “${causeText.replace(/\.$/, "")}” contributed to “${eventText.replace(/\.$/, "")}”.`, "Causal hypothesis", "Causal hypothesis"),
    ];
  }

  const consequence = clean.match(/^(.+?)[,;]?\s+(?:thereby\s+)?(pushing|driving|lifting|lowering|raising)\s+(.+)$/i);
  if (consequence) {
    const [, event, connector, outcome] = consequence;
    const eventText = sentence(event);
    const consequenceText = consequenceSentence(outcome);
    return [
      claim("C1", eventText, "Event"),
      claim("C2", consequenceText, "Consequence"),
      claim("C3", `The headline proposes that “${eventText.replace(/\.$/, "")}” is ${connector.toLowerCase()} “${outcome.trim()}”.`, "Causal hypothesis", "Causal hypothesis"),
    ];
  }

  const leadsTo = clean.match(/^(.+?)\s+(causes?|leads? to|results? in)\s+(.+)$/i);
  if (leadsTo) {
    const [, event, connector, outcome] = leadsTo;
    const eventText = completeOccurrence(event);
    const consequenceText = consequenceSentence(outcome);
    return [
      claim("C1", eventText, "Cause"),
      claim("C2", consequenceText, "Consequence"),
      claim("C3", `The headline proposes that “${eventText.replace(/\.$/, "")}” ${connector.toLowerCase()} “${consequenceText.replace(/\.$/, "")}”.`, "Causal hypothesis", "Causal hypothesis"),
    ];
  }

  const devanagari = clean.match(/^(.+?)\s+(के बाद|के कारण|से|मुळे|नंतर|कारण)\s+(.+)$/u);
  if (devanagari) {
    const [, event, connector, cause] = devanagari;
    return [
      claim("C1", sentence(event), "Event"),
      claim("C2", sentence(cause), "Cause"),
      claim("C3", `Headline causal link: “${event.trim()}” ${connector} “${cause.trim()}”.`, "Causal hypothesis", "Causal hypothesis"),
    ];
  }

  const independentClauses = clean.split(/\s*[,;]\s*/).filter((part) => finiteVerbPattern.test(part));
  if (independentClauses.length > 1) return independentClauses.slice(0, 3).map((part, index) => claim(`C${index + 1}`, sentence(part), index ? "Consequence" : "Event"));

  return [claim("C1", sentence(clean), "Event")];
}

function tokens(text: string) {
  return new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word)));
}

function overlap(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  let count = 0;
  a.forEach((word) => { if (b.has(word)) count += 1; });
  return count;
}

function corroboratesClaim(claim: Claim, article: RetrievedArticle) {
  if (!article.bodyRead || !article.excerpt) return false;
  const claimTokens = [...tokens(claim.text)];
  if (!claimTokens.length) return false;
  const articleTokens = tokens(`${article.title} ${article.excerpt}`);
  const matched = claimTokens.filter((word) => articleTokens.has(word));
  const numberTokens = claimTokens.filter((word) => /\d/.test(word));
  const numericMatch = numberTokens.every((word) => articleTokens.has(word));
  return numericMatch && matched.length / claimTokens.length >= 0.6;
}

export function sourceTypeFor(domain: string, publisher: string): SourceType {
  const value = `${domain} ${publisher}`.toLowerCase();
  if (/rbi\.org|\.gov\.|\.gov$|imf\.org|worldbank\.org|iea\.org|unctad\.org|un\.org|oecd\.org|reserve bank|international monetary fund|international energy agency|un trade/.test(value)) return "Official / primary";
  if (/data|statistics|federal reserve|research|institute|university/.test(value)) return "Data / analysis";
  return "Independent reporting";
}

export function makeEvidenceSources(claims: Claim[], articles: RetrievedArticle[]): EvidenceSource[] {
  return articles.slice(0, 8).map((article, index) => {
    const ranked = claims.map((claim) => ({ id: claim.id, score: overlap(claim.text, article.title) })).sort((a, b) => b.score - a.score);
    const bestScore = ranked[0]?.score ?? 0;
    const corroboratedClaims = claims.filter((claim) => corroboratesClaim(claim, article)).map((claim) => claim.id);
    const relatedClaims = corroboratedClaims.length ? corroboratedClaims : ranked.filter((item) => item.score === bestScore && bestScore >= 2).map((item) => item.id);
    const evidenceRole: EvidenceRole = corroboratedClaims.length ? "Supports" : relatedClaims.length ? "Adds context" : "Insufficient evidence";
    return {
      id: `S${index + 1}`,
      title: article.title,
      publisher: article.publisher || article.domain,
      date: article.date || "Date unavailable",
      url: article.url,
      sourceType: sourceTypeFor(article.domain, article.publisher),
      relatedClaims,
      evidenceRole,
      note: evidenceRole === "Supports"
        ? `A public article page was read. Matching excerpt: “${article.excerpt?.slice(0, 360)}”`
        : evidenceRole === "Adds context"
        ? article.bodyRead
          ? "A public article page was read, but its available text did not corroborate this decomposed claim."
          : "Title and metadata appear related. MacroLens could not read this article page, so this source is context—not claim verification."
        : "The retrieved title is not close enough to verify a decomposed claim.",
    };
  });
}

export function buildLiveAnalysis(headline: string, articles: RetrievedArticle[]): AnalysisResult {
  const language = detectLanguage(headline);
  const claims = decomposeHeadline(headline);
  const sources = makeEvidenceSources(claims, articles);
  const contextualIds = sources.filter((source) => source.evidenceRole === "Adds context" || source.evidenceRole === "Supports").map((source) => source.id);
  const readSources = sources.filter((source) => source.evidenceRole === "Supports");
  const hasContext = contextualIds.length > 0;
  const warning = "There is currently insufficient reliable evidence to verify this claim.";
  const linkedClaimIds = new Set(sources.flatMap((source) => source.relatedClaims));
  const assessedClaims = claims.map((claim) => {
    const supporting = sources.filter((source) => source.evidenceRole === "Supports" && source.relatedClaims.includes(claim.id));
    const hasPrimary = supporting.some((source) => source.sourceType === "Official / primary");
    const kind: Claim["kind"] = hasPrimary || supporting.length >= 2 ? "Confirmed fact" : supporting.length === 1 ? "Evidence-supported inference" : claim.kind;
    return { ...claim, kind, evidenceIds: sources.filter((source) => source.relatedClaims.includes(claim.id)).map((source) => source.id) };
  });
  const confirmed = assessedClaims.filter((claim) => claim.kind === "Confirmed fact").map((claim) => `${claim.text} This is corroborated by ${claim.evidenceIds.filter((id) => sources.find((source) => source.id === id)?.evidenceRole === "Supports").join(" and ")}.`);

  return {
    id: `live-${Date.now()}`,
    mode: "live",
    headline,
    detectedLanguage: language,
    updated: `${sources.length ? "Live analysis" : "Live retrieval unavailable"} · ${new Date().toISOString().slice(0, 10)}`,
    shortFrame: readSources.length
      ? `${readSources.length} public article page${readSources.length === 1 ? " was" : "s were"} read and matched against decomposed claims. Claims without direct textual corroboration remain unverified.`
      : hasContext
      ? `${sources.length} recent public source${sources.length === 1 ? " was" : "s were"} retrieved and linked at claim level. Their titles add context; article-body verification remains incomplete.`
      : warning,
    claims: assessedClaims,
    confirmed,
    uncertain: [
      warning,
      "A matching article excerpt corroborates wording, not every causal implication in a headline.",
      "No contradiction decision is made without article-level evidence.",
    ],
    nodes: [
      { id: "signal", layer: "Signal", title: confirmed.length ? "Claim corroborated by source text" : "Claim awaits verification", summary: assessedClaims[0]?.text || headline, kind: assessedClaims[0]?.kind || "Unverified claim", confidence: confirmed.length ? "Medium" : "Low", evidenceIds: contextualIds, uncertainty: confirmed.length ? "Corroboration is limited to the fetched public-source text and does not prove every implication." : warning },
      { id: "mechanism", layer: "Mechanism", title: "Possible transmission channel", summary: "Identify the price, incentive, institution or behaviour that would carry the effect forward.", kind: "Causal hypothesis", confidence: "Low", evidenceIds: [], uncertainty: "No article-body evidence has verified this connection." },
      { id: "dependency", layer: "Hidden dependency", title: "Assumption not yet tested", summary: "The implied explanation may depend on timing, geography, market structure or another event omitted from the headline.", kind: "Causal hypothesis", confidence: "Low", evidenceIds: [], uncertainty: "The necessary assumption has not been established." },
      { id: "consequence", layer: "Wider consequence", title: "Consequences remain conditional", summary: "Potential effects should not be presented as outcomes until the mechanism and exposure are supported.", kind: "Causal hypothesis", confidence: "Low", evidenceIds: [], uncertainty: "Magnitude, direction and affected groups remain open." },
      { id: "relevance", layer: "Relevance", title: "India and youth check", summary: "Look for a documented India-specific exposure before claiming relevance to households, students or firms.", kind: "Causal hypothesis", confidence: "Low", evidenceIds: [], uncertainty: "No local impact is verified by the current retrieval." },
    ],
    whyItMatters: ["The uncertainty is itself useful: MacroLens refuses to turn related headlines into false confirmation.", "A judge or reader can inspect what was retrieved and see exactly what remains missing."],
    winners: ["No evidence-supported winner identified"],
    losers: ["No evidence-supported loser identified"],
    stressTest: {
      challengingEvidence: [readSources.length ? "Read source text can corroborate the stated claim, but it may not establish every wider cause or consequence." : "No article-body counter-evidence was available in this retrieval."],
      alternatives: ["A different event may explain the same outcome.", "The headline may be opinion, satire, prediction or correlation rather than a factual causal statement."],
      missingInformation: ["Primary-source confirmation", "Article-body evidence", ...claims.filter((claim) => !linkedClaimIds.has(claim.id)).map((claim) => `Evidence for ${claim.id}`)],
      changeConditions: ["A primary source confirms the event", "Independent reporting agrees after reviewing the same facts", "Evidence directly tests the causal link"],
    },
    confidence: {
      level: "Low",
      reasons: [
        `${readSources.length} public article page${readSources.length === 1 ? "" : "s"} read; ${sources.length - readSources.length} result${sources.length - readSources.length === 1 ? "" : "s"} remained metadata-only.`,
        confirmed.length ? "At least one claim has direct text corroboration from the fetched sources." : "No claim met the direct-text corroboration threshold.",
        hasContext ? "Source pages can still be incomplete, blocked, updated, or contextually limited." : "No sufficiently related source title was found.",
      ],
    },
    sources,
    limitations: sources.length
      ? ["Only public, fetchable source text was read; paywalled, blocked and dynamically rendered pages remain metadata-only.", "Text corroboration verifies the stated claim, not every implied causal link or future consequence.", "Open the linked sources and review their full context before relying on a result."]
      : ["Retrieval was unavailable; no live metadata or evidence-backed causal analysis was produced.", "No curated evidence was substituted for the failed custom request.", "Use Retry or select a clearly labelled pre-verified demonstration."],
  };
}

export function searchQueryFor(headline: string) {
  return [...tokens(headline)].slice(0, 9).join(" ");
}
