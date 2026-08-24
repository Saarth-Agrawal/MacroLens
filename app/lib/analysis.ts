import type { AnalysisResult, Claim, ClaimCategory, CoreAnalysisResult, EvidenceRole, EvidenceSource, SourceType } from "../data/demoCases";
import { enrichAnalysisResult } from "./resultExperience.ts";

export type DetectedLanguage = "English" | "Hindi" | "Marathi";
export type RetrievedArticle = { title: string; url: string; publisher: string; domain: string; date: string; excerpt?: string; bodyRead?: boolean };

const stopWords = new Set([
  "the", "a", "an", "and", "or", "as", "after", "because", "amid", "following", "due", "to", "of", "in", "on", "for", "with", "at", "by",
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "will", "would", "can", "could", "may", "might", "about", "roughly", "approximately",
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

function tokenList(text: string) {
  const normalised = text.toLowerCase().replace(/\bu\.?\s*s\.?\b/gu, "usa");
  return normalised.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).map((word) => {
    if (["america", "american", "us", "united"].includes(word)) return "usa";
    return word;
  }).filter((word) => (word.length > 2 || /\d/.test(word)) && !stopWords.has(word));
}

function tokens(text: string) {
  return new Set(tokenList(text));
}

function overlap(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  let count = 0;
  a.forEach((word) => { if (b.has(word)) count += 1; });
  return count;
}

const officialDomains = [
  "rbi.org.in", "sebi.gov.in", "pib.gov.in", "mospi.gov.in", "treasury.gov", "federalreserve.gov", "bls.gov", "bea.gov", "census.gov", "sec.gov",
  "imf.org", "worldbank.org", "iea.org", "oecd.org", "un.org", "unctad.org", "who.int", "wto.org", "ecb.europa.eu", "europa.eu", "canada.ca",
];
const analysisDomains = ["stlouisfed.org", "nber.org", "pewresearch.org", "ourworldindata.org", "reliefweb.int", "nature.com", "science.org", "thelancet.com", "nejm.org", "jamanetwork.com"];
const reportingDomains = [
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "cnbc.com", "theguardian.com", "npr.org", "ndtv.com", "axios.com", "timesofindia.indiatimes.com",
  "aljazeera.com", "cbsnews.com", "bloomberg.com", "pbs.org", "wsj.com", "washingtonpost.com", "nytimes.com", "ft.com", "economist.com", "cnn.com",
  "abcnews.go.com", "nbcnews.com", "usatoday.com", "politico.com", "thehindu.com", "indianexpress.com", "business-standard.com", "livemint.com", "fortune.com", "time.com", "dw.com",
];
const trustedDomains = [...officialDomains, ...analysisDomains, ...reportingDomains];
const governmentSuffixes = [".gov", ".gov.in", ".gov.uk", ".gov.au", ".gc.ca", ".gouv.fr", ".go.jp", ".go.kr", ".gov.sg", ".govt.nz", ".gov.za", ".gov.br"];

function normaliseHost(domain: string) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/:]/)[0].replace(/^www\./, "").replace(/\.$/, "");
}

function hostMatches(host: string, root: string) {
  return host === root || host.endsWith(`.${root}`);
}

function trustedRoot(host: string) {
  return trustedDomains.find((domain) => hostMatches(host, domain));
}

export function sourceTypeFor(domain: string): SourceType {
  const host = normaliseHost(domain);
  if (officialDomains.some((domain) => hostMatches(host, domain)) || governmentSuffixes.some((suffix) => host.endsWith(suffix))) return "Official / primary";
  if (analysisDomains.some((domain) => hostMatches(host, domain))) return "Data / analysis";
  if (reportingDomains.some((domain) => hostMatches(host, domain))) return "Independent reporting";
  return "Unrated web source";
}

const contradictionPattern = /\b(?:not|never|false|falsely|fake|incorrect|inaccurate|misleading|myth|hoax|fabricated|untrue|debunk(?:ed|s|ing)?|refut(?:e|ed|es|ing)|reject(?:ed|s|ing)?|den(?:y|ied|ies)|contradict(?:s|ed|ory)?|unsupported|baseless|cannot|isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|doesn['’]?t|didn['’]?t|hasn['’]?t|haven['’]?t|no evidence|no longer|without evidence)\b|(?:नहीं|नही|गलत|झूठ|फर्जी|अफवाह|खंडन|नाही|चुकीचे|खोटे|बनावट)/iu;
const ambiguityPattern = /\b(?:claims?|alleges?|allegedly|rumou?rs?|unconfirmed|reportedly|viral post|questions? whether|fact[- ]?check|satire|parody|opinion|commentary|editorial|could|may|might|possibly|perhaps|unclear|disputed|little evidence|insufficient evidence|expected to|set to|projected to|forecast to)\b/iu;
const predictiveClaimPattern = /\b(?:will|would|could|may|might|expected|forecast|forecasted|projected|predicted|likely|plans?|aims?|targets?|set to)\b/iu;
const directionalPairs: Array<[Set<string>, Set<string>]> = [
  [new Set(["rise", "rises", "rose", "rising", "increase", "increases", "increased", "higher", "climb", "climbs", "surge", "surges", "gain", "gains"]), new Set(["fall", "falls", "fell", "falling", "decrease", "decreases", "decreased", "lower", "drop", "drops", "decline", "declines", "retreat", "retreats"])],
  [new Set(["approve", "approves", "approved", "accept", "accepts", "accepted", "support", "supports", "supported"]), new Set(["reject", "rejects", "rejected", "oppose", "opposes", "opposed", "block", "blocks", "blocked"])],
  [new Set(["accelerate", "accelerates", "accelerated", "speed", "speeds", "faster"]), new Set(["slow", "slows", "slowed", "slower", "decelerate", "decelerates"])],
];

function directionConflicts(claimWords: string[], passageWords: string[]) {
  return directionalPairs.some(([left, right]) => {
    const claimLeft = claimWords.some((word) => left.has(word));
    const claimRight = claimWords.some((word) => right.has(word));
    const passageLeft = passageWords.some((word) => left.has(word));
    const passageRight = passageWords.some((word) => right.has(word));
    return (claimLeft && passageRight && !passageLeft) || (claimRight && passageLeft && !passageRight);
  });
}

function orderedCoverage(needle: string[], haystack: string[]) {
  let matched = 0;
  for (const word of haystack) if (word === needle[matched]) matched += 1;
  return needle.length ? matched / needle.length : 0;
}

function matchingBigrams(needle: string[], haystack: string[]) {
  const haystackBigrams = new Set(haystack.slice(0, -1).map((word, index) => `${word}\u0000${haystack[index + 1]}`));
  return needle.slice(0, -1).filter((word, index) => haystackBigrams.has(`${word}\u0000${needle[index + 1]}`)).length;
}

type ClaimAssessment = { role: EvidenceRole; passage: string };

function assessClaimAgainstArticle(claim: Claim, article: RetrievedArticle): ClaimAssessment {
  const titleOverlap = overlap(claim.text, article.title);
  if (!article.bodyRead || !article.excerpt) return { role: titleOverlap >= 2 ? "Adds context" : "Insufficient evidence", passage: article.title };

  const claimWords = tokenList(claim.text);
  const claimNumbers = claimWords.filter((word) => /\d/.test(word));
  const passages = [article.title, ...article.excerpt.split(/(?<=[.!?।])\s+|\n+/u)].map((value) => value.trim()).filter(Boolean);
  let bestRelated: ClaimAssessment = { role: titleOverlap >= 2 ? "Adds context" : "Insufficient evidence", passage: article.title };
  let bestRelatedScore = titleOverlap;
  let support: ClaimAssessment | undefined;

  for (const passage of passages) {
    const passageWords = tokenList(passage);
    const passageTokens = new Set(passageWords);
    const matched = claimWords.filter((word) => passageTokens.has(word));
    const matchRatio = claimWords.length ? matched.length / claimWords.length : 0;
    const numericMatch = claimNumbers.every((word) => passageTokens.has(word));
    const sequenceMatch = orderedCoverage(claimWords, passageWords);
    const bigramThreshold = Math.min(2, Math.max(1, claimWords.length - 1));
    const directMatch = claimWords.length > 0 && numericMatch && matchRatio >= 0.75 && (sequenceMatch >= 0.9 || matchingBigrams(claimWords, passageWords) >= bigramThreshold);
    const directionalConflict = directionConflicts(claimWords, passageWords);
    const nonDirectionalClaimWords = claimWords.filter((word) => !directionalPairs.some(([left, right]) => left.has(word) || right.has(word)));
    const nonDirectionalMatch = nonDirectionalClaimWords.filter((word) => passageTokens.has(word)).length / Math.max(1, nonDirectionalClaimWords.length);
    const cleanedPassage = passage.replace(/\bnot only\b/giu, "");

    if ((directMatch && contradictionPattern.test(cleanedPassage)) || (directionalConflict && numericMatch && nonDirectionalMatch >= 0.6)) {
      return { role: "Contradicts", passage };
    }
    if (directMatch && (ambiguityPattern.test(passage) || passage.includes("?"))) {
      if (matched.length > bestRelatedScore) {
        bestRelated = { role: "Adds context", passage };
        bestRelatedScore = matched.length;
      }
      continue;
    }
    if (directMatch) support = { role: "Supports", passage };
    if (matched.length >= 2 && matchRatio >= 0.5 && matched.length > bestRelatedScore) {
      bestRelated = { role: "Adds context", passage };
      bestRelatedScore = matched.length;
    }
  }

  return support ?? bestRelated;
}

export function makeEvidenceSources(claims: Claim[], articles: RetrievedArticle[]): EvidenceSource[] {
  return articles.slice(0, 8).map((article, index) => {
    const sourceType = sourceTypeFor(article.domain);
    const assessments = claims.map((claim) => ({ claim, ...assessClaimAgainstArticle(claim, article) }));
    const strongestRole: EvidenceRole = assessments.some((item) => item.role === "Contradicts")
      ? "Contradicts"
      : assessments.some((item) => item.role === "Supports")
      ? "Supports"
      : assessments.some((item) => item.role === "Adds context")
      ? "Adds context"
      : "Insufficient evidence";
    const strongest = assessments.filter((item) => item.role === strongestRole);
    const eligible = sourceType !== "Unrated web source";
    const evidenceRole: EvidenceRole = !eligible && (strongestRole === "Supports" || strongestRole === "Contradicts") ? "Adds context" : strongestRole;
    const relatedClaims = strongest.map((item) => item.claim.id);
    const passage = strongest[0]?.passage?.slice(0, 360) || article.title;
    const note = !eligible && (strongestRole === "Supports" || strongestRole === "Contradicts")
      ? `Matching text was found, but ${article.domain} is an unrated web source. It is excluded from support and confidence: “${passage}”`
      : evidenceRole === "Supports"
      ? `Verification-eligible source text directly supports ${relatedClaims.join(", ")}: “${passage}”`
      : evidenceRole === "Contradicts"
      ? `Verification-eligible source text directly contradicts ${relatedClaims.join(", ")}: “${passage}”`
      : evidenceRole === "Adds context"
      ? article.bodyRead
        ? `The source text is related but hedged, ambiguous, or not a direct stance-clear match: “${passage}”`
        : "Only title metadata was available. Metadata can add context but cannot support or contradict a claim."
      : article.bodyRead
      ? "The read source text does not contain a direct, stance-clear match for a decomposed claim."
      : "The retrieved title is not close enough to verify a decomposed claim.";
    return {
      id: `S${index + 1}`,
      title: article.title,
      publisher: article.publisher || article.domain,
      date: article.date || "Date unavailable",
      url: article.url,
      sourceType,
      relatedClaims,
      evidenceRole,
      verificationDepth: article.bodyRead ? "full-text" : undefined,
      excerpt: article.bodyRead ? passage : undefined,
      translationDisclosure: "Source text is shown in its retrieved language; no human translation is implied.",
      limitations: article.bodyRead ? [] : ["Only title metadata was retrieved; this source cannot verify a claim."],
      note,
    };
  });
}

type EconomicCausalFrame = {
  mechanismTitle: string;
  mechanismSummary: string;
  dependencyTitle: string;
  dependencySummary: string;
  consequenceTitle: string;
  consequenceSummary: string;
  relevanceTitle: string;
  relevanceSummary: string;
  whyItMatters: string[];
  winners: string[];
  losers: string[];
  alternatives: string[];
  missingInformation: string[];
  changeConditions: string[];
};

function economicCausalFrame(headline: string): EconomicCausalFrame {
  const value = headline.normalize("NFKC").toLocaleLowerCase();

  if (/(?:flood|drought|monsoon|crop|tea|food|supply|production|output|shipping|freight|logistics|export|import|tariff|बाढ़|पूर|उत्पादन|पुरवठा|निर्यात|आयात|वाहतूक)/iu.test(value)) {
    return {
      mechanismTitle: "Supply and logistics channel",
      mechanismSummary: "Test whether output or transport disruption changes available supply, delivery times or landed costs.",
      dependencyTitle: "Damage, inventories and recovery",
      dependencySummary: "The pathway depends on the affected share of production, buffer stocks, route substitution and recovery time.",
      consequenceTitle: "Output, prices and trade",
      consequenceSummary: "Sustained disruption could affect sales, export volumes, input costs or consumer prices; none is automatic.",
      relevanceTitle: "Producers, workers and buyers",
      relevanceSummary: "Check which firms, workers, regions and households are directly exposed before claiming a wider effect.",
      whyItMatters: ["The economic effect depends on how much production and logistics are actually disrupted, and for how long.", "A local event matters more broadly only when evidence shows exposure through supply, trade, jobs or prices."],
      winners: ["Alternative suppliers if buyers switch orders"],
      losers: ["Affected producers, workers and logistics users"],
      alternatives: ["Inventory buffers or substitute routes may absorb the disruption.", "A separate demand change may explain prices or sales."],
      missingInformation: ["Affected production and shipment volumes", "Inventory buffers and recovery timeline"],
      changeConditions: ["Official output or trade data confirms disruption", "Multiple eligible sources document the same supply pathway"],
    };
  }

  if (/(?:rbi|repo|central bank|interest|loan|credit|emi|bank|monetary|आरबीआई|आरबीआय|रेपो|ब्याज|व्याज|कर्ज|बैंक|बँक)/iu.test(value)) {
    return {
      mechanismTitle: "Credit and rate pass-through",
      mechanismSummary: "Test whether the policy or funding change reaches deposit, loan and bond rates used by households and firms.",
      dependencyTitle: "Bank pricing and borrower mix",
      dependencySummary: "Transmission depends on funding costs, competition, loan resets, risk and the share of fixed-rate borrowing.",
      consequenceTitle: "Borrowing, saving and demand",
      consequenceSummary: "Financing conditions could influence EMIs, investment, saving and demand, but the timing and size remain conditional.",
      relevanceTitle: "Borrowers, savers and firms",
      relevanceSummary: "Check product-level rate changes before assigning gains or losses to Indian households or businesses.",
      whyItMatters: ["A policy-rate decision affects people only through actual changes in deposit, lending and market rates.", "The same decision can affect borrowers, savers and firms differently."],
      winners: ["Borrowers if lending rates fall and reset"],
      losers: ["Savers if deposit yields decline"],
      alternatives: ["Banks may not pass the policy change through quickly.", "Credit risk or funding costs may outweigh the policy signal."],
      missingInformation: ["Loan and deposit repricing data", "Borrower mix and reset schedules"],
      changeConditions: ["Banks publish corresponding product-rate changes", "Credit and demand data show a measurable response"],
    };
  }

  if (/(?:oil|gas|coal|electricity|energy|fuel|तेल|गैस|गॅस|बिजली|वीज|ऊर्जा)/iu.test(value)) {
    return {
      mechanismTitle: "Energy-cost pass-through",
      mechanismSummary: "Test whether the energy change reaches power, transport or production costs for exposed sectors.",
      dependencyTitle: "Contracts, hedges and regulation",
      dependencySummary: "The effect depends on contract terms, hedging, inventories, taxes, subsidies and regulated tariffs.",
      consequenceTitle: "Margins, output and prices",
      consequenceSummary: "Persistent cost changes could affect company margins, production decisions and consumer prices.",
      relevanceTitle: "Energy-intensive Indian exposure",
      relevanceSummary: "Identify imported-energy dependence and sector-level use before claiming an India-wide effect.",
      whyItMatters: ["Energy is an input across transport and production, but pass-through varies sharply by sector.", "Contracts, taxes and regulation can delay or reverse the apparent headline effect."],
      winners: ["Energy-efficient or hedged firms"],
      losers: ["Unhedged energy-intensive producers and transport users"],
      alternatives: ["Currency or tax changes may explain domestic prices instead.", "Hedging and long-term contracts may delay pass-through."],
      missingInformation: ["Import exposure and contract terms", "Sector-level energy intensity"],
      changeConditions: ["Wholesale and retail energy prices move together", "Company disclosures show a material cost effect"],
    };
  }

  if (/(?:company|firm|startup|profit|earnings|revenue|sales|margin|merger|acquisition|ipo|investment|कंपनी|नफा|मुनाफा|महसूल|राजस्व|कमाई|निवेश|गुंतवणूक)/iu.test(value)) {
    return {
      mechanismTitle: "Firm cash-flow and strategy",
      mechanismSummary: "Test whether the event changes revenue, costs, financing, competitive position or capital allocation.",
      dependencyTitle: "Execution and market response",
      dependencySummary: "The pathway depends on customer demand, execution, financing terms and competitor behaviour.",
      consequenceTitle: "Margins, investment and jobs",
      consequenceSummary: "A sustained business effect could influence margins, investment or hiring, but those outcomes need direct evidence.",
      relevanceTitle: "Customers, workers and investors",
      relevanceSummary: "Separate company-specific exposure from broader sector or household relevance.",
      whyItMatters: ["A company announcement matters economically only when it changes cash flow, competition, investment or jobs.", "Execution evidence is more informative than the announcement alone."],
      winners: ["Customers or competitors that gain from the change"],
      losers: ["Exposed workers, suppliers or investors if execution fails"],
      alternatives: ["The announcement may not change delivered products or financial results.", "A wider sector trend may explain the same outcome."],
      missingInformation: ["Company filings and delivered milestones", "Revenue, cost and customer evidence"],
      changeConditions: ["Audited filings confirm the financial effect", "Operational data confirms execution"],
    };
  }

  return {
    mechanismTitle: "Price, income and incentive channel",
    mechanismSummary: "Test whether the event changes a price, cost, income, incentive or access to finance.",
    dependencyTitle: "Exposure, timing and substitution",
    dependencySummary: "The pathway depends on who is exposed, when contracts reset and whether substitutes are available.",
    consequenceTitle: "Demand, output and distribution",
    consequenceSummary: "Any effect on spending, production or distribution remains conditional until directly supported.",
    relevanceTitle: "India and decision relevance",
    relevanceSummary: "Identify a documented exposure for Indian households, workers or firms before claiming local impact.",
    whyItMatters: ["Economic relevance depends on a documented path from the event to prices, income, finance or incentives.", "The evidence ledger shows where that path is supported and where it remains a hypothesis."],
    winners: ["Groups insulated from the documented change"],
    losers: ["Groups directly exposed to the documented change"],
    alternatives: ["A separate demand, policy or supply change may explain the outcome.", "Timing or substitution may weaken the apparent relationship."],
    missingInformation: ["Magnitude and timing of the economic exposure", "Comparable data before and after the event"],
    changeConditions: ["Eligible sources document the transmission channel", "Independent data shows the expected economic response"],
  };
}

export function buildLiveAnalysis(headline: string, articles: RetrievedArticle[]): AnalysisResult {
  const language = detectLanguage(headline);
  const causalFrame = economicCausalFrame(headline);
  const claims = decomposeHeadline(headline);
  const sources = makeEvidenceSources(claims, articles);
  const contextualIds = sources.filter((source) => source.evidenceRole !== "Insufficient evidence").map((source) => source.id);
  const fullTextSources = sources.filter((source) => source.verificationDepth === "full-text");
  const fullTextSupportingSources = fullTextSources.filter((source) => source.evidenceRole === "Supports");
  const fullTextContradictingSources = fullTextSources.filter((source) => source.evidenceRole === "Contradicts");
  const unratedRelatedSources = sources.filter((source) => source.sourceType === "Unrated web source" && source.relatedClaims.length > 0);
  const hasContext = contextualIds.length > 0;
  const warning = "There is currently insufficient reliable evidence to verify this claim.";
  const linkedClaimIds = new Set(sources.flatMap((source) => source.relatedClaims));
  const sourceOrganisation = (source: EvidenceSource) => {
    try {
      const host = normaliseHost(new URL(source.url).hostname);
      return trustedRoot(host) ?? host;
    } catch {
      return source.publisher.trim().toLowerCase();
    }
  };
  const directSupportFor = (claim: Claim) => fullTextSupportingSources.filter((source) => source.relatedClaims.includes(claim.id));
  const directContradictionFor = (claim: Claim) => fullTextContradictingSources.filter((source) => source.relatedClaims.includes(claim.id));
  const stronglySupportedClaimIds = new Set(claims.filter((claim) => {
    const supporting = directSupportFor(claim);
    const independentOrganisations = new Set(supporting.map(sourceOrganisation));
    return supporting.some((source) => source.sourceType === "Official / primary") || independentOrganisations.size >= 3;
  }).map((claim) => claim.id));
  const assessedClaims = claims.map((claim) => {
    const supporting = directSupportFor(claim);
    const contradicted = directContradictionFor(claim).length > 0;
    const predictive = predictiveClaimPattern.test(claim.text);
    const kind: Claim["kind"] = claim.category === "Causal hypothesis"
      ? "Causal hypothesis"
      : contradicted
      ? "Unverified claim"
      : stronglySupportedClaimIds.has(claim.id) && !predictive
      ? "Confirmed fact"
      : supporting.length
      ? "Evidence-supported inference"
      : "Unverified claim";
    return {
      ...claim,
      kind,
      isHeadlineClaim: true,
      evidenceIds: sources.filter((source) => source.relatedClaims.includes(claim.id)).map((source) => source.id),
    };
  });
  const confirmed = assessedClaims.filter((claim) => claim.kind === "Confirmed fact").map((claim) => `${claim.text} This is corroborated by ${claim.evidenceIds.filter((id) => sources.find((source) => source.id === id)?.evidenceRole === "Supports").join(" and ")}.`);
  const factualClaims = assessedClaims.filter((claim) => claim.category !== "Causal hypothesis");
  const hasCausalHypothesis = assessedClaims.some((claim) => claim.category === "Causal hypothesis");
  const allFactualClaimsStrong = factualClaims.length > 0 && factualClaims.every((claim) => stronglySupportedClaimIds.has(claim.id) && claim.kind === "Confirmed fact");
  const hasConflict = fullTextContradictingSources.length > 0;
  const supportingOrganisationCount = new Set(fullTextSupportingSources.map(sourceOrganisation)).size;
  const confidenceLevel = !hasConflict && !hasCausalHypothesis && allFactualClaimsStrong
    ? "High"
    : !hasConflict && fullTextSupportingSources.length
    ? "Medium"
    : "Low";
  const metadataOnlyCount = sources.length - fullTextSources.length;
  const sourceReadSummary = `${fullTextSources.length} public article page${fullTextSources.length === 1 ? " was" : "s were"} read; ${metadataOnlyCount} result${metadataOnlyCount === 1 ? " remained" : "s remained"} metadata-only.`;
  const confidenceReasons = confidenceLevel === "High"
    ? [
      sourceReadSummary,
      `${supportingOrganisationCount} verification-eligible source organisation${supportingOrganisationCount === 1 ? " directly supports" : "s directly support"} every factual claim in the headline.`,
      "No verification-eligible source contradicted the claim; unrated websites and metadata-only results were excluded.",
    ]
    : confidenceLevel === "Medium"
    ? [
      sourceReadSummary,
      `${supportingOrganisationCount} verification-eligible source organisation${supportingOrganisationCount === 1 ? " supports" : "s support"} at least one claim.`,
      hasCausalHypothesis ? "A causal part of the headline remains a hypothesis, so the overall result cannot be High." : "Not every factual claim met the primary-or-three-independent-source threshold for High.",
    ]
    : [
      sourceReadSummary,
      hasConflict
        ? `${fullTextContradictingSources.length} verification-eligible source${fullTextContradictingSources.length === 1 ? " directly contradicts" : "s directly contradict"} at least one claim.`
        : "No verification-eligible source directly supported a claim.",
      unratedRelatedSources.length
        ? `${unratedRelatedSources.length} matching unrated web source${unratedRelatedSources.length === 1 ? " was" : "s were"} excluded from support and confidence.`
        : hasContext ? "Related or ambiguous sources remain context only." : "No sufficiently related source was found.",
    ];
  const allSubmittedClaimsConfirmed = assessedClaims.length > 0 && assessedClaims.every((claim) => claim.kind === "Confirmed fact");
  const limitedSupportNote = allSubmittedClaimsConfirmed
    ? "Every submitted headline claim met the confirmation threshold; wider causes and effects remain separate."
    : fullTextSupportingSources.length
    ? "Verification-eligible source text supports part of the headline, but not every submitted claim met the confirmation threshold."
    : warning;
  const primaryClaimKind = assessedClaims[0]?.kind;
  const primaryClaimId = assessedClaims[0]?.id;
  const signalEvidenceIds = fullTextSources
    .filter((source) => primaryClaimId && source.relatedClaims.includes(primaryClaimId) && (source.evidenceRole === "Supports" || source.evidenceRole === "Contradicts"))
    .map((source) => source.id);
  const confirmedClaimText = assessedClaims.filter((claim) => claim.kind === "Confirmed fact").map((claim) => claim.text).join(" ");
  const contradictedClaim = assessedClaims.find((claim) => directContradictionFor(claim).length > 0);

  const coreResult: CoreAnalysisResult = {
    id: `live-${Date.now()}`,
    mode: "live",
    headline,
    detectedLanguage: language,
    updated: `${sources.length ? "Live analysis" : "Live retrieval unavailable"} · ${new Date().toISOString().slice(0, 10)}`,
    shortFrame: hasConflict
      ? `Eligible source text conflicts with this statement: ${contradictedClaim?.text || headline} The claim remains unresolved.`
      : allSubmittedClaimsConfirmed
      ? `${confirmedClaimText} Wider causes and personal effects remain separate unless independently supported.`
      : fullTextSources.length
      ? "Eligible source text supports part of the headline, but the complete claim remains unverified."
      : hasContext
      ? `${sources.length} recent public source${sources.length === 1 ? " was" : "s were"} retrieved and linked at claim level. Their titles add context; article-body verification remains incomplete.`
      : warning,
    claims: assessedClaims,
    confirmed,
    uncertain: [
      hasConflict ? "At least one verification-eligible source directly contradicts a decomposed claim." : limitedSupportNote,
      "Metadata-only and unrated sources cannot verify a claim, regardless of how many are retrieved.",
      "Explicit contradiction cues are detected, but subtle framing, satire and complex semantics still require human review.",
    ],
    nodes: [
      { id: "signal", layer: "Signal", title: hasConflict ? "Claim challenged by source text" : confirmed.length ? "Claim corroborated by source text" : primaryClaimKind === "Evidence-supported inference" ? "Claim has limited source support" : "Claim awaits verification", summary: assessedClaims[0]?.text || headline, kind: primaryClaimKind || "Unverified claim", confidence: confidenceLevel, evidenceIds: signalEvidenceIds, uncertainty: hasConflict ? "The retrieved evidence contains a direct contradiction, so this claim is not confirmed." : allSubmittedClaimsConfirmed ? "The submitted claim is corroborated; that does not prove every wider implication." : limitedSupportNote },
      { id: "mechanism", layer: "Mechanism", title: causalFrame.mechanismTitle, summary: causalFrame.mechanismSummary, kind: "Causal hypothesis", confidence: "Low", evidenceIds: [], uncertainty: "No verification-eligible source directly establishes this transmission channel." },
      { id: "dependency", layer: "Hidden dependency", title: causalFrame.dependencyTitle, summary: causalFrame.dependencySummary, kind: "Causal hypothesis", confidence: "Low", evidenceIds: [], uncertainty: "The necessary exposure and timing conditions have not been established." },
      { id: "consequence", layer: "Wider consequence", title: causalFrame.consequenceTitle, summary: causalFrame.consequenceSummary, kind: "Causal hypothesis", confidence: "Low", evidenceIds: [], uncertainty: "Magnitude, direction and affected groups remain open." },
      { id: "relevance", layer: "Relevance", title: causalFrame.relevanceTitle, summary: causalFrame.relevanceSummary, kind: "Causal hypothesis", confidence: "Low", evidenceIds: [], uncertainty: "No source directly verifies this local or decision-level exposure." },
    ],
    whyItMatters: causalFrame.whyItMatters,
    winners: causalFrame.winners,
    losers: causalFrame.losers,
    stressTest: {
      challengingEvidence: [hasConflict ? `${fullTextContradictingSources.map((source) => source.id).join(" and ")} directly contradict the claim.` : fullTextSources.length ? "Read source text can corroborate the stated claim, but it may not establish every wider cause or consequence." : "No article-body counter-evidence was available in this retrieval."],
      alternatives: causalFrame.alternatives,
      missingInformation: [...causalFrame.missingInformation, ...claims.filter((claim) => !linkedClaimIds.has(claim.id)).map((claim) => `Evidence for ${claim.id}`)],
      changeConditions: causalFrame.changeConditions,
    },
    confidence: {
      level: confidenceLevel,
      reasons: confidenceReasons,
    },
    sources,
    limitations: sources.length
      ? ["Only verification-eligible public source text can affect claim status; unrated sites and metadata-only results remain context.", "The conservative rules detect explicit negation, refutation, hedging and directional conflict, but they are not a universal semantic truth engine.", "Open the linked sources and review their full context before relying on a result."]
      : ["Retrieval was unavailable; no live metadata or evidence-backed causal analysis was produced.", "No curated evidence was substituted for the failed custom request.", "Use Retry or select a clearly labelled pre-verified demonstration."],
  };
  return enrichAnalysisResult(coreResult);
}

export function searchQueryFor(headline: string) {
  return [...tokens(headline)].slice(0, 9).join(" ");
}
