import assert from "node:assert/strict";
import test from "node:test";
import { articleFromTavilyResult } from "../app/api/news/route.ts";
import { buildLiveAnalysis, decomposeHeadline, detectLanguage, makeEvidenceSources, sourceTypeFor } from "../app/lib/analysis.ts";
import { buildEconomicLensQuery } from "../app/lib/economicLens.ts";
import { bodyTextWarning, buildHeadlineCandidates, chooseVisualConfusableAlternative, mergeLayoutAndDetail, validateHeadline } from "../app/lib/headlineOcr.ts";

test("adds a business and economics lens to any headline", () => {
  const assam = buildEconomicLensQuery("Assam floods 2026");
  assert.match(assam, /Assam floods 2026/);
  assert.match(assam, /production|supply|prices|jobs|trade/);

  const moon = buildEconomicLensQuery("The Moon is made of cheese");
  assert.match(moon, /The Moon is made of cheese/);
  assert.match(moon, /business economic impact/);

  const economic = "Oil prices rise after OPEC cuts output";
  assert.equal(buildEconomicLensQuery(economic), economic);

  const hindiEconomic = "आरबीआई ने रेपो दर 0.25 प्रतिशत घटाई";
  assert.equal(buildEconomicLensQuery(hindiEconomic), hindiEconomic);

  const longHeadline = "A".repeat(500);
  assert.match(buildEconomicLensQuery(longHeadline), /business economic impact/);
});

test("detects the three supported headline languages", () => {
  assert.equal(detectLanguage("RBI keeps the repo rate unchanged"), "English");
  assert.equal(detectLanguage("आरबीआई ने रेपो दर स्थिर रखी"), "Hindi");
  assert.equal(detectLanguage("आरबीआयने रेपो दर कायम ठेवली आहे"), "Marathi");
});

test("separates event, cause and causal link", () => {
  const claims = decomposeHeadline("Oil prices rise after shipping disruption");
  assert.equal(claims.length, 3);
  assert.equal(claims[0].text, "Oil prices rise.");
  assert.equal(claims[0].category, "Event");
  assert.equal(claims[1].text, "A shipping disruption occurred.");
  assert.equal(claims[1].category, "Cause");
  assert.equal(claims[2].category, "Causal hypothesis");
  assert.equal(claims[0].kind, "Unverified claim");
  assert.equal(claims[1].kind, "Unverified claim");
  assert.equal(claims[2].kind, "Causal hypothesis");
  assert.match(claims[2].text, /contributed/i);
});

test("produces complete labelled claims for five unseen headline structures", () => {
  const cases = [
    {
      headline: "Copper prices fall after China factory data disappoints",
      expected: ["Copper prices fall.", "China factory data disappoints."],
      categories: ["Event", "Cause", "Causal hypothesis"],
    },
    {
      headline: "Airline shares climb as crude oil costs retreat",
      expected: ["Airline shares climb.", "Crude oil costs retreat."],
      categories: ["Event", "Cause", "Causal hypothesis"],
    },
    {
      headline: "Government raises import duty, pushing smartphone prices higher",
      expected: ["Government raises import duty.", "Smartphone prices may rise."],
      categories: ["Event", "Consequence", "Causal hypothesis"],
    },
    {
      headline: "Rupee weakness leads to higher import costs",
      expected: ["A rupee weakness occurred.", "The reported consequence was higher import costs."],
      categories: ["Cause", "Consequence", "Causal hypothesis"],
    },
    {
      headline: "Monsoon delays disrupt onion supplies across Maharashtra",
      expected: ["Monsoon delays disrupt onion supplies across Maharashtra."],
      categories: ["Event"],
    },
  ] as const;

  for (const item of cases) {
    const claims = decomposeHeadline(item.headline);
    assert.deepEqual(claims.slice(0, item.expected.length).map((claim) => claim.text), [...item.expected]);
    assert.deepEqual(claims.map((claim) => claim.category), [...item.categories]);
    for (const claim of claims) assert.match(claim.text, /^[A-Z].*[.]$/);
  }
});

test("never upgrades title metadata to supporting evidence", () => {
  const claims = decomposeHeadline("Oil prices rise after shipping disruption");
  const sources = makeEvidenceSources(claims, [{
    title: "Oil prices rise after disruption to major shipping route",
    url: "https://example.com/report",
    publisher: "Example News",
    domain: "example.com",
    date: "2026-08-22",
  }]);
  assert.equal(sources[0].evidenceRole, "Adds context");
  assert.notEqual(sources[0].evidenceRole, "Supports");
});

test("activates the exact insufficient-evidence safeguard", () => {
  const result = buildLiveAnalysis("Unsupported claim with no source", []);
  assert.equal(result.mode, "live");
  assert.equal(result.confidence.level, "Low");
  assert.equal(result.confirmed.length, 0);
  assert.ok(result.uncertain.includes("There is currently insufficient reliable evidence to verify this claim."));
});

test("uses a headline-specific economic frame only after a claim is confirmable", () => {
  const result = buildLiveAnalysis("Assam floods disrupt tea production and exports in 2026", [{
    title: "Assam floods disrupt tea production and exports in 2026",
    url: "https://commerce.gov.in/assam-tea",
    publisher: "Ministry of Commerce",
    domain: "commerce.gov.in",
    date: "2026-08-24",
    bodyRead: true,
    excerpt: "Assam floods disrupt tea production and exports in 2026.",
  }]);
  assert.equal(result.claims[0].kind, "Confirmed fact");
  assert.equal(result.nodes[1].title, "Supply and logistics channel");
  assert.match(result.nodes[2].title, /inventories|recovery/i);
});

test("treats ReliefWeb body text as eligible institutional analysis", () => {
  assert.equal(sourceTypeFor("reliefweb.int"), "Data / analysis");
  const result = buildLiveAnalysis("Assam floods 2026", [{
    title: "India: Flash Floods - Jul 2026",
    url: "https://reliefweb.int/disaster/ff-2026-000139-ind",
    publisher: "ReliefWeb",
    domain: "reliefweb.int",
    date: "2026-08-24",
    bodyRead: true,
    excerpt: "The Assam floods began in July 2026 after exceptionally heavy monsoonal rainfall.",
  }]);
  assert.equal(result.claims[0].kind, "Evidence-supported inference");
  assert.equal(result.nodes[1].title, "Supply and logistics channel");
});

test("uses read public-source text to corroborate a checkable claim", () => {
  const result = buildLiveAnalysis("$40 trillion and counting: America's debt problem explained", [
    {
      title: "US national debt reaches $40 trillion",
      url: "https://home.treasury.gov/example",
      publisher: "US Treasury",
      domain: "home.treasury.gov",
      date: "2026-08-23",
      bodyRead: true,
      excerpt: "America's debt has reached about $40 trillion, according to the latest Treasury statement.",
    },
    {
      title: "America's debt tops $40 trillion",
      url: "https://www.reuters.com/example",
      publisher: "Reuters",
      domain: "www.reuters.com",
      date: "2026-08-23",
      bodyRead: true,
      excerpt: "America's national debt rose above $40 trillion this week, according to Treasury data.",
    },
  ]);
  assert.equal(result.claims[0].kind, "Confirmed fact");
  assert.equal(result.confidence.level, "High");
  assert.match(result.confidence.reasons[1], /2 verification-eligible source organisations/i);
  assert.equal(result.sources.filter((source) => source.evidenceRole === "Supports").length, 2);
  assert.match(result.shortFrame, /article page/i);
});

test("keeps matching headline metadata as context rather than support", () => {
  const result = buildLiveAnalysis("$40 trillion and counting: America's debt problem explained", [
    { title: "U.S. debt hits $40 trillion", url: "https://news.google.com/one", publisher: "Reuters", domain: "reuters.com", date: "2026-08-23" },
    { title: "America's debt crosses $40 trillion", url: "https://news.google.com/two", publisher: "Associated Press", domain: "apnews.com", date: "2026-08-23" },
    { title: "National debt tops $40 trillion in the U.S.", url: "https://news.google.com/three", publisher: "BBC", domain: "bbc.com", date: "2026-08-23" },
  ]);
  assert.equal(result.claims[0].kind, "Unverified claim");
  assert.equal(result.sources.every((source) => source.evidenceRole === "Adds context"), true);
  assert.equal(result.sources.every((source) => source.verificationDepth === undefined), true);
  assert.equal(result.confidence.level, "Low");
});

test("labels explicit reliable refutations as contradictions instead of support", () => {
  const result = buildLiveAnalysis("The Moon is made of cheese", [
    { title: "Fact check: the Moon is not made of cheese", url: "https://www.reuters.com/fact-check/moon", publisher: "Reuters", domain: "www.reuters.com", date: "2026-08-24", bodyRead: true, excerpt: "The claim that the Moon is made of cheese is false. Scientific evidence shows that it consists of rock." },
    { title: "No, the Moon is not made of cheese", url: "https://apnews.com/article/moon", publisher: "Associated Press", domain: "apnews.com", date: "2026-08-24", bodyRead: true, excerpt: "The Moon is not made of cheese. This familiar statement is a myth contradicted by lunar samples." },
  ]);
  assert.equal(result.sources.every((source) => source.evidenceRole === "Contradicts"), true);
  assert.equal(result.claims[0].kind, "Unverified claim");
  assert.equal(result.confirmed.length, 0);
  assert.equal(result.confidence.level, "Low");
});

test("excludes unrated matching websites from support and confidence", () => {
  const result = buildLiveAnalysis("The Moon is made of cheese", [
    { title: "The Moon is made of cheese", url: "https://viral-one.example/moon", publisher: "Viral One", domain: "viral-one.example", date: "2026-08-24", bodyRead: true, excerpt: "The Moon is made of cheese, according to this website." },
    { title: "Cheese Moon confirmed", url: "https://viral-two.example/moon", publisher: "Viral Two", domain: "viral-two.example", date: "2026-08-24", bodyRead: true, excerpt: "The Moon is made of cheese and the story is completely true." },
  ]);
  assert.equal(result.sources.every((source) => source.sourceType === "Unrated web source"), true);
  assert.equal(result.sources.every((source) => source.evidenceRole === "Adds context"), true);
  assert.equal(result.confidence.level, "Low");
  assert.match(result.confidence.reasons[2], /excluded from support and confidence/i);
});

test("does not let publisher text or lookalike domains spoof a primary source", () => {
  assert.equal(sourceTypeFor("imf.org.evil.example"), "Unrated web source");
  assert.equal(sourceTypeFor("random-blog.example"), "Unrated web source");
  assert.equal(sourceTypeFor("home.treasury.gov"), "Official / primary");
});

test("does not treat a Tavily relevance snippet as read article text", () => {
  const snippetOnly = articleFromTavilyResult({
    title: "US debt result",
    url: "https://www.reuters.com/example",
    content: "This search snippet is deliberately longer than eighty characters and mentions America's debt reaching $40 trillion.",
  });
  const rawPage = articleFromTavilyResult({
    title: "US debt result",
    url: "https://www.reuters.com/example",
    content: "Short search snippet",
    raw_content: "America's debt reached $40 trillion according to the published data. ".repeat(4),
  });
  assert.equal(snippetOnly?.bodyRead, false);
  assert.equal(rawPage?.bodyRead, true);
});

test("eligible contradiction prevents High even when another source supports", () => {
  const result = buildLiveAnalysis("$40 trillion and counting: America's debt problem explained", [
    { title: "US debt reaches $40 trillion", url: "https://home.treasury.gov/debt", publisher: "US Treasury", domain: "home.treasury.gov", date: "2026-08-24", bodyRead: true, excerpt: "America's debt has reached approximately $40 trillion." },
    { title: "US debt has not reached $40 trillion", url: "https://www.reuters.com/fact-check/debt", publisher: "Reuters", domain: "www.reuters.com", date: "2026-08-24", bodyRead: true, excerpt: "America's debt has not reached $40 trillion; that claim is false." },
  ]);
  assert.equal(result.sources[0].evidenceRole, "Supports");
  assert.equal(result.sources[1].evidenceRole, "Contradicts");
  assert.equal(result.claims[0].kind, "Unverified claim");
  assert.equal(result.confidence.level, "Low");
});

test("treats forecasts as context and detects reversed direction", () => {
  const forecast = buildLiveAnalysis("$40 trillion and counting: America's debt problem explained", [
    { title: "US debt is set to hit $40 trillion", url: "https://www.washingtonpost.com/debt", publisher: "The Washington Post", domain: "washingtonpost.com", date: "2026-08-24", bodyRead: true, excerpt: "America's debt is expected to reach $40 trillion later this year." },
  ]);
  assert.equal(forecast.sources[0].evidenceRole, "Adds context");
  assert.equal(forecast.confidence.level, "Low");

  const direction = buildLiveAnalysis("Oil prices rise", [
    { title: "Oil prices fall", url: "https://www.reuters.com/markets/oil", publisher: "Reuters", domain: "reuters.com", date: "2026-08-24", bodyRead: true, excerpt: "Oil prices fall sharply in the latest session." },
  ]);
  assert.equal(direction.sources[0].evidenceRole, "Contradicts");
  assert.equal(direction.confidence.level, "Low");
});

test("requires exact numbers and preserves who-did-what relationships", () => {
  const wrongNumber = buildLiveAnalysis("$40 trillion and counting: America's debt problem explained", [
    { title: "US debt reaches $41 trillion", url: "https://www.reuters.com/markets/debt", publisher: "Reuters", domain: "reuters.com", date: "2026-08-24", bodyRead: true, excerpt: "America's debt has reached $41 trillion." },
  ]);
  assert.notEqual(wrongNumber.sources[0].evidenceRole, "Supports");
  assert.equal(wrongNumber.confidence.level, "Low");

  const wrongRelationship = buildLiveAnalysis("Elon Musk is CEO of OpenAI", [
    { title: "OpenAI CEO Sam Altman responds to Elon Musk", url: "https://www.reuters.com/technology/openai", publisher: "Reuters", domain: "reuters.com", date: "2026-08-24", bodyRead: true, excerpt: "Elon Musk criticised OpenAI CEO Sam Altman during the dispute." },
  ]);
  assert.notEqual(wrongRelationship.sources[0].evidenceRole, "Supports");
  assert.equal(wrongRelationship.confidence.level, "Low");
});

test("ranks the central large Hindi region above surrounding article text", () => {
  const lines = [
    { text: "लीक से हटकर", confidence: 95, bbox: { x0: 413, y0: 65, x1: 1106, y1: 247 }, rowHeight: 182 },
    { text: "बनाए", confidence: 88, bbox: { x0: 414, y0: 261, x1: 678, y1: 367 }, rowHeight: 142 },
    { text: "मुनाफा", confidence: 95, bbox: { x0: 414, y0: 414, x1: 772, y1: 561 }, rowHeight: 200 },
    { text: "पैकेजिंग सेक्टर के दिन फिर गए", confidence: 93, bbox: { x0: 34, y0: 68, x1: 354, y1: 102 }, rowHeight: 36 },
    { text: "वैल्यूएशन नहीं दे रहा है पैकेजिंग", confidence: 88, bbox: { x0: 34, y0: 228, x1: 370, y1: 267 }, rowHeight: 39 },
    { text: "कंपनियों पर कर्ज का बोझ बढ़ा है", confidence: 95, bbox: { x0: 36, y0: 514, x1: 374, y1: 549 }, rowHeight: 35 },
  ];
  const candidates = buildHeadlineCandidates(lines, 1800, 1266, "Hindi");
  assert.ok(candidates.length >= 1);
  assert.equal(candidates[0].textHint, "लीक से हटकर बनाए मुनाफा");
  assert.ok(candidates[0].selectionConfidence < 100);
  assert.ok(candidates[0].region.left > 15 && candidates[0].region.left < 30);
  assert.ok(candidates[0].region.top < 8);
});

test("combines layout anchors with a detailed OCR token without importing body text", () => {
  const merged = mergeLayoutAndDetail("लीक से हटकर बनाए मुनाफा", "लीक रो हटकर बनाए मोटा मुनाफा");
  assert.equal(merged, "लीक से हटकर बनाए मोटा मुनाफा");
});

test("blocks paragraph-like OCR before analysis", () => {
  const body = "पैकेजिंग इंडस्ट्री की कई कंपनियों की बुनियाद मजबूत है। इसके बावजूद बाजार अच्छा वैल्यूएशन नहीं दे रहा है। विस्तार योजनाओं की वजह से इन कंपनियों पर कर्ज का बोझ बढ़ा है। ".repeat(3);
  const validation = validateHeadline(body, 91);
  assert.equal(validation.plausible, false);
  assert.equal(validation.warning, bodyTextWarning);
  assert.ok(validation.reasons.includes("longer than 180 characters"));
  assert.ok(validation.reasons.includes("contains several sentences"));
});

test("headline validation accepts Devanagari combining marks", () => {
  const validation = validateHeadline("लीक से हटकर बनाए मोटा मुनाफा", 93);
  assert.equal(validation.plausible, true);
  assert.deepEqual(validation.reasons, []);
});

test("uses a constrained visual pass for one low-confidence halftone mark", () => {
  assert.equal(chooseVisualConfusableAlternative("बनाएं मोटा", "बनाए मोटा", 74, 46), "बनाए मोटा");
  assert.equal(chooseVisualConfusableAlternative("कंपनियां बढ़ीं", "कपनियां बढ़ीं", 94, 70), "कंपनियां बढ़ीं");
});
