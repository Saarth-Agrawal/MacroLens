import assert from "node:assert/strict";
import test from "node:test";
import { auditResultLayers, demoCases, withUserProfile, type AnalysisResult } from "../app/data/demoCases.ts";
import { buildLiveAnalysis } from "../app/lib/analysis.ts";
import { explanationPresentation, sourceInspectorModel } from "../app/lib/resultExperience.ts";

function sentenceCount(text: string) {
  return text.trim().split(/(?<=[.!?])\s+(?=[A-Z“"'])/u).filter(Boolean).length;
}

function knownEvidenceIds(result: AnalysisResult) {
  return new Set(result.sources.map((source) => source.id));
}

function assertKnownEvidence(result: AnalysisResult, ids: string[], label: string) {
  const known = knownEvidenceIds(result);
  for (const id of ids) assert.ok(known.has(id), `${label} cites unknown evidence ${id}`);
}

function usableIndependentSourceCount(result: AnalysisResult) {
  return new Set(result.sources
    .filter((source) => source.sourceType !== "Unrated web source" && (source.evidenceRole === "Supports" || source.evidenceRole === "Contradicts"))
    .map((source) => source.publisher.trim().toLowerCase()))
    .size;
}

function buildContestedResult() {
  return buildLiveAnalysis("$40 trillion and counting: America's debt problem explained", [
    { title: "US debt reaches $40 trillion", url: "https://home.treasury.gov/debt", publisher: "US Treasury", domain: "home.treasury.gov", date: "2026-08-24", bodyRead: true, excerpt: "America's debt has reached approximately $40 trillion." },
    { title: "US debt has not reached $40 trillion", url: "https://www.reuters.com/fact-check/debt", publisher: "Reuters", domain: "www.reuters.com", date: "2026-08-24", bodyRead: true, excerpt: "America's debt has not reached $40 trillion; that claim is false." },
  ]);
}

const confirmed = demoCases[0];
const contested = buildContestedResult();
const insufficient = buildLiveAnalysis("Unsupported claim with no source", []);
const sparseLive = buildLiveAnalysis("US debt reaches $40 trillion", [{
  title: "US debt reaches $40 trillion",
  url: "https://home.treasury.gov/debt",
  publisher: "US Treasury",
  domain: "home.treasury.gov",
  date: "2026-08-24",
  bodyRead: true,
  excerpt: "US debt reached $40 trillion.",
}]);

test("P0 Bottom Line is audited, concise, traceable and status-aware", () => {
  for (const [expectedStatus, result] of [
    ["Confirmed", confirmed],
    ["Contested", contested],
    ["Insufficient", insufficient],
  ] as const) {
    assert.equal(result.bottomLine.evidenceStatus, expectedStatus);
    assert.equal(result.bottomLine.auditorApproved, true);
    assert.ok(sentenceCount(result.bottomLine.explanation) >= 2);
    assert.ok(sentenceCount(result.bottomLine.explanation) <= 3);
    assert.notEqual(result.bottomLine.explanation.trim().toLowerCase(), result.headline.trim().toLowerCase());
    assert.ok(result.bottomLine.keyImplication.trim());
    assert.ok(result.bottomLine.keyUncertainty.trim());
    assert.ok(result.bottomLine.lastUpdated.trim());
    assert.equal(result.bottomLine.independentSourceCount, usableIndependentSourceCount(result));
    assertKnownEvidence(result, result.bottomLine.evidenceIds, "Bottom Line");
    if (expectedStatus !== "Insufficient") assert.ok(result.bottomLine.evidenceIds.length > 0);
    assert.doesNotMatch(result.bottomLine.explanation, /macroeconomic transmission|exogenous shock|causal inference|semantic retrieval|evidence adjudication/i);
    assert.deepEqual(auditResultLayers(result), []);
  }
});

test("P0 insufficient evidence states the boundary and creates no artificial debate or personal impact", () => {
  assert.equal(insufficient.bottomLine.independentSourceCount, 0);
  assert.equal(insufficient.bottomLine.evidenceIds.length, 0);
  assert.match(insufficient.bottomLine.explanation, /cannot currently establish|insufficient reliable evidence|cannot be established/i);
  assert.equal(insufficient.councilPerspectives.length, 0);
  assert.ok(insufficient.councilSynthesis.evidenceNeeded.length > 0);
  assert.match(insufficient.councilSynthesis.evidenceNeeded.join(" "), /primary|independent|reliable|source|evidence/i);
  assert.match(insufficient.visualStory.whyYouCare.text, /cannot|not established|insufficient|no effect/i);
  assert.doesNotMatch(insufficient.visualStory.whyYouCare.text, /you will|your (?:income|emi|loan|savings) (?:will|would)/i);
});

test("P0 visual story has four traceable stages and conditional next steps", () => {
  const stages = [
    ["What happened", confirmed.visualStory.whatHappened],
    ["Why", confirmed.visualStory.why],
    ["What next", confirmed.visualStory.whatNext],
    ["Why you care", confirmed.visualStory.whyYouCare],
  ] as const;
  assert.equal(stages.length, 4);
  for (const [label, stage] of stages) {
    assert.ok(stage.text.trim(), `${label} is empty`);
    assert.ok(stage.evidenceIds.length > 0 || /inference|uncertain|insufficient|cannot|not established/i.test(JSON.stringify(stage)), `${label} has neither evidence nor an inference/uncertainty label`);
    assertKnownEvidence(confirmed, stage.evidenceIds, label);
  }
  assert.match(`${confirmed.visualStory.whatNext.text} ${confirmed.visualStory.whatNext.uncertainty}`, /\b(if|may|might|could|would|monitor|depends?|conditional|weaker)\b/i);
  assert.doesNotMatch(confirmed.visualStory.whatNext.text, /will definitely|guaranteed|certain to/i);
});

test("P0 profile changes relevance without changing established facts", () => {
  const student = withUserProfile(confirmed, "Student");
  const smallBusiness = withUserProfile(confirmed, "Small-business owner");
  assert.equal(student.selectedProfile, "Student");
  assert.equal(student.visualStory.whyYouCare.userProfile, "Student");
  assert.equal(smallBusiness.visualStory.whyYouCare.userProfile, "Small-business owner");
  assert.notEqual(student.visualStory.whyYouCare.text, smallBusiness.visualStory.whyYouCare.text);
  assert.deepEqual(student.claims, confirmed.claims);
  assert.deepEqual(student.sources, confirmed.sources);
  assert.deepEqual(student.visualStory.whatHappened, confirmed.visualStory.whatHappened);
});

const councilRoles = ["Verifier", "Challenger", "Mechanism Analyst", "Relevance Analyst", "Auditor"] as const;

test("P0 Council exposes five distinct, evidence-linked role perspectives", () => {
  assert.equal(confirmed.councilPerspectives.length, 5);
  assert.deepEqual(new Set(confirmed.councilPerspectives.map((item) => item.role)), new Set(councilRoles));
  assert.equal(new Set(confirmed.councilPerspectives.map((item) => item.purpose)).size, 5);
  assert.equal(new Set(confirmed.councilPerspectives.map((item) => item.position)).size, 5);
  const knownClaims = new Set(confirmed.claims.map((claim) => claim.id));
  for (const perspective of confirmed.councilPerspectives) {
    assert.ok(perspective.purpose.trim());
    assert.ok(perspective.position.trim());
    assert.ok(perspective.reasoning.trim());
    assert.ok(perspective.evidenceIds.length > 0, `${perspective.role} has no evidence IDs`);
    assert.ok(perspective.claimIds.length > 0, `${perspective.role} has no claim IDs`);
    assertKnownEvidence(confirmed, perspective.evidenceIds, perspective.role);
    for (const id of perspective.claimIds) assert.ok(knownClaims.has(id), `${perspective.role} cites unknown claim ${id}`);
    assert.ok(perspective.uncertainty.trim());
    assert.ok(perspective.challenges.trim());
    assert.ok(perspective.questionForUser.trim().endsWith("?"));
    assert.match(perspective.confidenceCategory, /^(High|Medium|Low)$/);
  }
  const challenger = confirmed.councilPerspectives.find((item) => item.role === "Challenger");
  assert.ok(challenger);
  assert.match(`${challenger.position} ${challenger.challenges}`, /weak|missing|uncertain|alternative|caus|context|unsupported|challenge/i);
  const auditor = confirmed.councilPerspectives.find((item) => item.role === "Auditor");
  assert.ok(auditor);
  assert.match(`${auditor.position} ${auditor.reasoning} ${auditor.challenges}`, /unsupported|removed|boundary|overconfident|citation|evidence ends/i);
  assert.doesNotMatch(confirmed.bottomLine.explanation, /every borrower.?s EMI unchanged/i);
});

test("P0 Council synthesis exposes disagreement without voting or proof-by-agreement", () => {
  const synthesis = confirmed.councilSynthesis;
  assert.ok(synthesis.areasOfAgreement.length > 0);
  assert.ok(synthesis.areasOfDisagreement.length > 0);
  assert.ok(synthesis.unresolvedQuestions.length > 0);
  assert.ok(synthesis.evidenceNeeded.length > 0);
  for (const disagreement of synthesis.areasOfDisagreement) {
    assert.equal(disagreement.roles.length, 2);
    assert.notEqual(disagreement.roles[0], disagreement.roles[1]);
    assert.ok(disagreement.subject.trim());
    assert.match(disagreement.concern, /^(Fact|Causation|Relevance|Time horizon)$/);
    for (const ids of Object.values(disagreement.evidenceByRole)) if (ids) assertKnownEvidence(confirmed, ids, `Council disagreement: ${disagreement.subject}`);
  }
  const wording = JSON.stringify(synthesis);
  assert.doesNotMatch(wording, /\bmajority\b|\bvote\b|\bvoting\b|\boutvoted\b/i);
  assert.doesNotMatch(wording, /agreement (?:is|as|equals?) proof|agreement proves/i);
});

test("P0 Form Your View asks 2-3 specific questions without supplying or scoring an answer", () => {
  assert.ok(confirmed.reflectionPrompts.length >= 2);
  assert.ok(confirmed.reflectionPrompts.length <= 3);
  assert.equal(new Set(confirmed.reflectionPrompts).size, confirmed.reflectionPrompts.length);
  for (const prompt of confirmed.reflectionPrompts) {
    assert.ok(prompt.trim().endsWith("?"));
    assert.doesNotMatch(prompt, /correct answer|the answer is|we conclude|you should conclude|score|points?/i);
  }
  assert.match(confirmed.reflectionPrompts.join(" "), /RBI|repo|rate|neutral|inflation|borrower|EMI/i);
});

test("P0 event evidence is not copied into unsupported causal or relevance stages", () => {
  assert.deepEqual(sparseLive.visualStory.whatHappened.evidenceIds, ["S1"]);
  assert.deepEqual(sparseLive.visualStory.why.evidenceIds, []);
  assert.deepEqual(sparseLive.visualStory.whatNext.evidenceIds, []);
  assert.deepEqual(sparseLive.visualStory.whyYouCare.evidenceIds, []);
  assert.deepEqual(auditResultLayers(sparseLive), []);
});

test("P0 sparse evidence does not manufacture an Evidence Council disagreement", () => {
  assert.equal(sparseLive.councilPerspectives.length, 0);
  for (const disagreement of sparseLive.councilSynthesis.areasOfDisagreement) {
    const [leftRole, rightRole] = disagreement.roles;
    const left = [...new Set(disagreement.evidenceByRole[leftRole] ?? [])].sort();
    const right = [...new Set(disagreement.evidenceByRole[rightRole] ?? [])].sort();
    assert.notDeepEqual(left, right);
  }
});

test("P0 live Bottom Line explains the claim without retrieval telemetry", () => {
  assert.equal(sparseLive.bottomLine.evidenceStatus, "Confirmed");
  assert.match(sparseLive.bottomLine.explanation, /debt|\$40 trillion/i);
  assert.doesNotMatch(sparseLive.bottomLine.explanation, /public article page|page(?:s)? (?:was|were) read|metadata-only|retriev(?:al|ed)|decomposed claims|source organisation/i);
  assert.doesNotMatch(JSON.stringify({ bottomLine: sparseLive.bottomLine, visualStory: sparseLive.visualStory }), /confirmation threshold was not met|claim awaits verification|cannot currently verify the core claim/i);
});

test("P0 selected profile updates the Relevance Analyst without changing facts", () => {
  const student = withUserProfile(confirmed, "Student");
  const business = withUserProfile(confirmed, "Small-business owner");
  const studentAnalyst = student.councilPerspectives.find((entry) => entry.role === "Relevance Analyst");
  const businessAnalyst = business.councilPerspectives.find((entry) => entry.role === "Relevance Analyst");
  assert.ok(studentAnalyst);
  assert.ok(businessAnalyst);
  assert.notEqual(`${studentAnalyst.position} ${studentAnalyst.reasoning}`, `${businessAnalyst.position} ${businessAnalyst.reasoning}`);
  assert.match(`${studentAnalyst.position} ${studentAnalyst.reasoning}`, /student|education|job|young/i);
  assert.match(`${businessAnalyst.position} ${businessAnalyst.reasoning}`, /business|firm|credit|supplier|investment/i);
  assert.deepEqual(student.claims, business.claims);
  assert.deepEqual(student.sources, business.sources);
});

test("P0 source inspector distinguishes source excerpts from editorial notes", () => {
  const metadataResult = buildLiveAnalysis("Related headline", [{
    title: "Related headline",
    url: "https://www.reuters.com/example",
    publisher: "Reuters",
    domain: "reuters.com",
    date: "2026-08-24",
    bodyRead: false,
  }]);
  const metadataView = sourceInspectorModel(metadataResult.sources[0], "live");
  assert.equal(metadataView.retrievalDepthLabel, "Metadata only");
  assert.equal(metadataView.excerpt, null);
  assert.match(metadataView.excerptAvailabilityLabel, /no excerpt available/i);
  assert.notEqual(metadataView.excerpt, metadataResult.sources[0].note);

  const fullTextView = sourceInspectorModel(sparseLive.sources[0], "live");
  assert.equal(fullTextView.retrievalDepthLabel, "Article text read");
  assert.equal(fullTextView.excerpt, sparseLive.sources[0].excerpt);
});

test("P0 every curated source stores review depth and attributable source text", () => {
  for (const result of demoCases) {
    for (const source of result.sources) {
      const view = sourceInspectorModel(source, result.mode);
      assert.equal(view.retrievalDepthLabel, "Curated source review", `${result.id}/${source.id} has no curated review depth`);
      assert.ok(view.excerpt, `${result.id}/${source.id} has no attributable source text`);
      assert.match(view.excerptLabel, /source excerpt|source-title text/i);
      if (source.excerptKind === "source-title") {
        assert.equal(view.excerpt, source.title);
        assert.match(view.excerptAvailabilityLabel, /article body unavailable/i);
      }
    }
  }
});

test("P0 language disclosure never claims a translation that did not occur", () => {
  const unavailable = explanationPresentation(sparseLive, "Hindi");
  assert.equal(unavailable.text, sparseLive.bottomLine.explanation);
  assert.equal(unavailable.translated, false);
  assert.match(unavailable.disclosure, /translation unavailable|showing .*English/i);
  assert.doesNotMatch(unavailable.disclosure, /machine translation/i);

  const translated = explanationPresentation(confirmed, "Hindi");
  assert.equal(translated.text, confirmed.translatedFrame?.Hindi);
  assert.equal(translated.translated, true);
  assert.match(translated.disclosure, /machine translation|not human-verified/i);
});
