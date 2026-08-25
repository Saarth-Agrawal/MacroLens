import type {
  AnalysisResult,
  BottomLine,
  ConfidenceLevel,
  CoreAnalysisResult,
  CouncilPerspective,
  CouncilRole,
  CouncilSynthesis,
  EvidenceSource,
  EvidenceStatus,
  ProfileRelevance,
  ResultLayers,
  StatementKind,
  UserProfile,
  VisualStory,
} from "../data/demoCases";

export const userProfiles: UserProfile[] = [
  "General reader",
  "Student",
  "Salaried household",
  "Small-business owner",
  "Senior citizen",
];

const councilRoles: CouncilRole[] = ["Verifier", "Challenger", "Mechanism Analyst", "Relevance Analyst", "Auditor"];
const insufficientWarning = "There is currently insufficient reliable evidence to verify this claim.";

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function lowerFirst(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toLocaleLowerCase()}${value.slice(1)}`;
}

function ensureSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function conciseExplanation(value: string, fallback: string) {
  const clean = value.replace(/\s+/g, " ").trim() || fallback;
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map((item) => ensureSentence(item)) ?? [];
  if (sentences.length >= 2) return sentences.slice(0, 3).join(" ");
  return `${ensureSentence(clean)} Wider effects remain conditional on the evidence and transmission pathway.`;
}

function firstSentence(value: string, fallback: string) {
  const clean = value.replace(/\s+/g, " ").trim() || fallback;
  return ensureSentence(clean.match(/^[^.!?]+[.!?]?/u)?.[0] || fallback);
}

function isUsable(source: EvidenceSource, mode: CoreAnalysisResult["mode"]) {
  if (source.sourceType === "Unrated web source") return false;
  if (source.evidenceRole !== "Supports" && source.evidenceRole !== "Contradicts") return false;
  return mode === "curated" || source.verificationDepth === "full-text" || source.verificationDepth === "headline-consensus";
}

function isInspectableContext(source: EvidenceSource, mode: CoreAnalysisResult["mode"]) {
  if (source.sourceType === "Unrated web source" || source.evidenceRole === "Insufficient evidence") return false;
  return mode === "curated" || source.verificationDepth === "full-text" || source.verificationDepth === "headline-consensus";
}

function evidenceStatus(result: CoreAnalysisResult, usableSources: EvidenceSource[]): EvidenceStatus {
  const submittedClaims = result.claims.filter((claim) => claim.isHeadlineClaim);
  const claimsToAssess = submittedClaims.length ? submittedClaims : result.claims;
  const assessedIds = new Set(claimsToAssess.map((claim) => claim.id));
  const relevantSources = usableSources.filter((source) => source.relatedClaims.some((id) => assessedIds.has(id)));
  if (relevantSources.some((source) => source.evidenceRole === "Contradicts")) return "Contested";
  const supportedClaimIds = new Set(relevantSources.filter((source) => source.evidenceRole === "Supports").flatMap((source) => source.relatedClaims));
  return claimsToAssess.length > 0 && claimsToAssess.every((claim) => claim.kind === "Confirmed fact" && supportedClaimIds.has(claim.id))
    ? "Confirmed"
    : "Insufficient";
}

function nodeFor(result: CoreAnalysisResult, layer: CoreAnalysisResult["nodes"][number]["layer"]) {
  return result.nodes.find((node) => node.layer === layer);
}

function knownEvidence(result: CoreAnalysisResult, ids: string[]) {
  const known = new Set(result.sources.map((source) => source.id));
  return unique(ids).filter((id) => known.has(id));
}

function knownClaims(result: CoreAnalysisResult, ids: string[]) {
  const known = new Set(result.claims.map((claim) => claim.id));
  return unique(ids).filter((id) => known.has(id));
}

function headlineClaims(result: CoreAnalysisResult) {
  const submitted = result.claims.filter((claim) => claim.isHeadlineClaim);
  return submitted.length ? submitted : result.claims;
}

function inspectableNodeEvidence(result: CoreAnalysisResult, ids: string[]) {
  return knownEvidence(result, ids).filter((id) => {
    const source = result.sources.find((item) => item.id === id);
    return Boolean(source && isInspectableContext(source, result.mode));
  });
}

function confidenceFor(kind: StatementKind | undefined, fallback: ConfidenceLevel): ConfidenceLevel {
  if (kind === "Confirmed fact") return "High";
  if (kind === "Evidence-supported inference" || kind === "Causal hypothesis") return "Medium";
  return fallback === "High" ? "Medium" : fallback;
}

function buildProfileRelevance(result: CoreAnalysisResult, status: EvidenceStatus): Record<UserProfile, ProfileRelevance> {
  const relevance = nodeFor(result, "Relevance");
  const relevanceEvidence = inspectableNodeEvidence(result, relevance?.evidenceIds ?? []);
  const conditions = relevance?.uncertainty || result.uncertain[0] || "The available evidence does not establish who is exposed or when.";
  const generic = relevance?.summary || result.whyItMatters[0] || "No decision-level exposure has been established.";
  const student = result.whyItMatters.find((item) => /student|young|education|job|skill|worker/i.test(item)) || result.whyItMatters[2] || generic;
  const household = result.whyItMatters.find((item) => /household|emi|deposit|saving|consumer|income/i.test(item)) || result.whyItMatters[0] || generic;
  const smallBusiness = result.whyItMatters.find((item) => /firm|business|supplier|credit|cost|investment/i.test(item)) || result.whyItMatters[1] || generic;
  const senior = result.whyItMatters.find((item) => /deposit|saving|pension|household|consumer/i.test(item)) || generic;
  const timeHorizon = result.stressTest.missingInformation[0]
    ? `Depends on ${lowerFirst(result.stressTest.missingInformation[0])}.`
    : "The timing cannot be established from the current evidence.";

  const make = (profile: UserProfile, text: string): ProfileRelevance => status === "Insufficient" || !relevanceEvidence.length
    ? {
      profile,
      text: "A profile-specific effect is not established by the available evidence.",
      exposureType: "No established exposure",
      conditions,
      timeHorizon: "Not established",
      evidenceIds: [],
    }
    : {
      profile,
      text: ensureSentence(text),
      exposureType: "Indirect",
      conditions,
      timeHorizon,
      evidenceIds: relevanceEvidence,
    };

  return {
    "General reader": make("General reader", generic),
    Student: make("Student", student),
    "Salaried household": make("Salaried household", household),
    "Small-business owner": make("Small-business owner", smallBusiness),
    "Senior citizen": make("Senior citizen", senior),
  };
}

function buildCouncil(
  result: CoreAnalysisResult,
  status: EvidenceStatus,
  usableSources: EvidenceSource[],
  contextualSources: EvidenceSource[],
  profile: UserProfile,
  profileRelevance: Record<UserProfile, ProfileRelevance>,
): CouncilPerspective[] {
  if (!usableSources.length || status === "Insufficient") return [];

  const submittedClaims = headlineClaims(result);
  const submittedIds = new Set(submittedClaims.map((claim) => claim.id));
  const supporting = usableSources.filter((source) => source.evidenceRole === "Supports" && source.relatedClaims.some((id) => submittedIds.has(id)));
  const challenging = contextualSources.filter((source) => source.evidenceRole === "Contradicts" || source.evidenceRole === "Adds context");
  const verifierEvidence = knownEvidence(result, supporting.map((source) => source.id));
  const challengeEvidence = knownEvidence(result, challenging.map((source) => source.id));
  const signal = nodeFor(result, "Signal");
  const mechanism = nodeFor(result, "Mechanism") ?? nodeFor(result, "Hidden dependency");
  const relevance = nodeFor(result, "Relevance");
  const unresolvedClaims = result.claims.filter((claim) => claim.kind !== "Confirmed fact");
  const confirmedClaims = result.claims.filter((claim) => claim.kind === "Confirmed fact");
  const allClaimIds = result.claims.map((claim) => claim.id);
  const mechanismEvidence = inspectableNodeEvidence(result, mechanism?.evidenceIds ?? []);
  const relevanceEvidence = inspectableNodeEvidence(result, relevance?.evidenceIds ?? []);
  const verifierClaims = knownClaims(result, supporting.flatMap((source) => source.relatedClaims).filter((id) => submittedIds.has(id)));
  const challengerClaims = knownClaims(result, challenging.flatMap((source) => source.relatedClaims));
  const mechanismClaims = knownClaims(result, mechanismEvidence.flatMap((id) => result.sources.find((source) => source.id === id)?.relatedClaims ?? []));
  const relevanceClaims = knownClaims(result, relevanceEvidence.flatMap((id) => result.sources.find((source) => source.id === id)?.relatedClaims ?? []));
  const auditorEvidence = unique([...verifierEvidence, ...challengeEvidence, ...mechanismEvidence, ...relevanceEvidence]);
  const councilReady = [
    [verifierEvidence, verifierClaims],
    [challengeEvidence, challengerClaims],
    [mechanismEvidence, mechanismClaims],
    [relevanceEvidence, relevanceClaims],
    [auditorEvidence, allClaimIds],
  ].every(([evidence, claims]) => evidence.length > 0 && claims.length > 0);
  if (!councilReady) return [];
  const selectedRelevance = profileRelevance[profile];

  return [
    {
      role: "Verifier",
      purpose: "Establish only what eligible sources directly support.",
      position: signal?.summary || confirmedClaims[0]?.text || "The core event is supported, but wider effects are not automatically confirmed.",
      reasoning: `Direct support is linked to ${verifierEvidence.join(", ")}; claims outside that link remain unconfirmed.`,
      evidenceIds: verifierEvidence,
      claimIds: verifierClaims,
      uncertainty: signal?.uncertainty || result.uncertain[0] || "Not every part of the headline has direct support.",
      challenges: "Do not turn source agreement about the event into proof of every cause or consequence.",
      questionForUser: "Which part of the original headline matters most to verify first?",
      confidenceCategory: confidenceFor(signal?.kind, result.confidence.level),
    },
    {
      role: "Challenger",
      purpose: "Find weak links, counter-evidence and credible alternative explanations.",
      position: result.stressTest.challengingEvidence[0] || "The strongest evidence still leaves a causal or timing gap.",
      reasoning: result.stressTest.alternatives[0] || "A related event or source may fit the evidence without proving the proposed explanation.",
      evidenceIds: challengeEvidence,
      claimIds: challengerClaims,
      uncertainty: result.uncertain[0] || "The decisive missing evidence has not been retrieved.",
      challenges: result.stressTest.alternatives.length ? `Alternative explanations: ${result.stressTest.alternatives.join(" ")}` : "The cause, scale or time horizon remains uncertain and should be challenged.",
      questionForUser: "What evidence would change your view of the weakest link?",
      confidenceCategory: status === "Contested" ? "Low" : "Medium",
    },
    {
      role: "Mechanism Analyst",
      purpose: "Test whether the proposed cause can plausibly produce the stated effect.",
      position: mechanism?.summary || "No complete transmission mechanism has been established.",
      reasoning: `The pathway depends on ${lowerFirst(mechanism?.uncertainty || result.stressTest.missingInformation[0] || "missing exposure and timing evidence")}`,
      evidenceIds: mechanismEvidence,
      claimIds: mechanismClaims,
      uncertainty: mechanism?.uncertainty || "The strength and direction of the mechanism are not fully established.",
      challenges: "A plausible mechanism is an inference, not a confirmed outcome; each step needs its own support.",
      questionForUser: "Which link in the mechanism seems least secure?",
      confidenceCategory: confidenceFor(mechanism?.kind, "Medium"),
    },
    {
      role: "Relevance Analyst",
      purpose: "Translate the evidence into conditional, user-specific relevance without advice.",
      position: selectedRelevance.text,
      reasoning: `For the selected ${profile} profile, exposure is ${selectedRelevance.exposureType.toLocaleLowerCase()} and depends on ${lowerFirst(selectedRelevance.conditions)}`,
      evidenceIds: relevanceEvidence,
      claimIds: relevanceClaims,
      uncertainty: relevance?.uncertainty || "Personal exposure and timing are not established.",
      challenges: "A broad economic pathway does not prove the same effect for every household, student or business.",
      questionForUser: `Does this pathway genuinely apply to a ${profile.toLocaleLowerCase()}, or only under narrower conditions?`,
      confidenceCategory: confidenceFor(relevance?.kind, "Medium"),
    },
    {
      role: "Auditor",
      purpose: "Enforce traceability, source quality and calibrated language before publication.",
      position: "The Bottom Line may be shown only with its evidence boundary and unsupported claims removed.",
      reasoning: `${auditorEvidence.length} eligible evidence item${auditorEvidence.length === 1 ? " is" : "s are"} traceable; ${unresolvedClaims.length} claim${unresolvedClaims.length === 1 ? " remains" : "s remain"} inference, hypothesis or unverified. Missing excerpts and translation limits remain disclosed.`,
      evidenceIds: auditorEvidence,
      claimIds: knownClaims(result, allClaimIds),
      uncertainty: result.limitations[0] || "Source and model limitations remain part of the result.",
      challenges: "Any overconfident, uncited, advice-like or unsupported statement must be removed or relabelled at the boundary where the evidence ends.",
      questionForUser: "Would you rely on this conclusion with the stated limitations?",
      confidenceCategory: result.confidence.level,
    },
  ];
}

function buildSynthesis(result: CoreAnalysisResult, status: EvidenceStatus, council: CouncilPerspective[]): CouncilSynthesis {
  if (!council.length) {
    return {
      areasOfAgreement: [],
      areasOfDisagreement: [],
      unresolvedQuestions: result.uncertain.length ? result.uncertain.slice(0, 3) : [insufficientWarning],
      evidenceNeeded: result.stressTest.missingInformation.length
        ? result.stressTest.missingInformation.slice(0, 3)
        : ["A reliable primary source and independent source text linked to the claim"],
    };
  }

  const verifier = council.find((item) => item.role === "Verifier")!;
  const challenger = council.find((item) => item.role === "Challenger")!;
  const verifierSet = new Set(verifier.evidenceIds);
  const hasIndependentChallenge = challenger.evidenceIds.some((id) => !verifierSet.has(id));
  return {
    areasOfAgreement: [
      `The source-backed event can be separated from its conditional effects: ${verifier.position}`,
      "Source agreement supports only the claims it directly traces; it is not proof of causation.",
    ],
    areasOfDisagreement: hasIndependentChallenge ? [{
        roles: ["Verifier", "Challenger"],
        subject: status === "Contested" ? "Whether the core claim can be treated as established" : "How far the verified event supports the proposed explanation",
        evidenceByRole: { Verifier: verifier.evidenceIds, Challenger: challenger.evidenceIds },
        concern: status === "Contested" ? "Fact" : "Causation",
      }] : [],
    unresolvedQuestions: result.uncertain.slice(0, 3),
    evidenceNeeded: result.stressTest.missingInformation.slice(0, 3),
  };
}

function buildBottomLine(result: CoreAnalysisResult, status: EvidenceStatus, usableSources: EvidenceSource[], auditorApproved: boolean): BottomLine {
  const consequence = nodeFor(result, "Wider consequence");
  const submittedIds = new Set(headlineClaims(result).map((claim) => claim.id));
  const relevantSources = usableSources.filter((source) => source.relatedClaims.some((id) => submittedIds.has(id)));
  const usableIds = relevantSources.map((source) => source.id);
  const independentSourceCount = new Set(relevantSources.map((source) => source.publisher.trim().toLocaleLowerCase()).filter(Boolean)).size;
  if (status === "Insufficient") {
    return {
      explanation: `${insufficientWarning} Retrieved material may support part of the headline, but the complete claim and any personal effect remain unverified.`,
      evidenceStatus: status,
      keyImplication: "No evidence-backed conclusion or personal impact should be inferred from this headline.",
      keyUncertainty: result.uncertain[0] || "Whether any reliable source directly supports the claim.",
      independentSourceCount,
      lastUpdated: result.updated,
      evidenceIds: knownEvidence(result, usableIds),
      auditorApproved,
    };
  }
  const liveConfirmedClaims = headlineClaims(result).filter((claim) => claim.kind === "Confirmed fact");
  const explanation = status === "Contested"
    ? `Eligible sources disagree about part of this headline or its interpretation. ${firstSentence(result.shortFrame, "The core claim remains disputed.")} The wider outcome remains conditional while that disagreement is unresolved.`
    : result.mode === "live"
    ? `Reliable source text supports this core statement: ${liveConfirmedClaims.map((claim) => claim.text).join(" ")} The evidence does not, by itself, establish a wider cause or personal effect.`
    : conciseExplanation(result.shortFrame, "Eligible sources support the core event.");
  return {
    explanation,
    evidenceStatus: status,
    keyImplication: result.mode === "live"
      ? status === "Contested"
        ? "Treat the headline as unresolved until the contradiction is explained by stronger or newer evidence."
        : "The core statement is source-backed; any wider economic or personal effect still needs separate evidence."
      : consequence?.summary || result.whyItMatters[0] || "The wider implication remains conditional on the documented pathway.",
    keyUncertainty: result.uncertain[0] || consequence?.uncertainty || "The timing and scale of downstream effects remain uncertain.",
    independentSourceCount,
    lastUpdated: result.updated,
    evidenceIds: knownEvidence(result, usableIds),
    auditorApproved,
  };
}

function buildVisualStory(result: CoreAnalysisResult, status: EvidenceStatus, profile: UserProfile, profileRelevance: Record<UserProfile, ProfileRelevance>): VisualStory {
  const signal = nodeFor(result, "Signal");
  const mechanism = nodeFor(result, "Mechanism") ?? nodeFor(result, "Hidden dependency");
  const consequence = nodeFor(result, "Wider consequence");
  const relevance = profileRelevance[profile];

  if (status === "Insufficient") {
    return {
      whatHappened: { text: "The headline was received, but current evidence does not establish that its factual claim is true.", status: "Unverified claim", evidenceIds: [] },
      why: { text: "The proposed explanation cannot be established from the available sources.", supportType: "Unverified claim", conditions: "Reliable evidence for the event and mechanism is missing.", evidenceIds: [] },
      whatNext: { text: "What happens next cannot be established from the current evidence.", timeHorizon: "Not established", indicators: result.stressTest.missingInformation.slice(0, 3), uncertainty: result.uncertain[0] || insufficientWarning, evidenceIds: [] },
      whyYouCare: {
        text: relevance.text,
        userProfile: relevance.profile,
        exposureType: relevance.exposureType,
        conditions: relevance.conditions,
        timeHorizon: relevance.timeHorizon,
        evidenceIds: relevance.evidenceIds,
      },
    };
  }

  const signalEvidence = inspectableNodeEvidence(result, signal?.evidenceIds ?? []);
  const mechanismEvidence = inspectableNodeEvidence(result, mechanism?.evidenceIds ?? []);
  const consequenceEvidence = inspectableNodeEvidence(result, consequence?.evidenceIds ?? []);
  return {
    whatHappened: {
      text: signal?.summary || result.claims[0]?.text || result.headline,
      status: signal?.kind || result.claims[0]?.kind || "Unverified claim",
      evidenceIds: signalEvidence,
    },
    why: {
      text: mechanism?.summary || "The mechanism remains an evidence-supported inference.",
      supportType: mechanism?.kind || "Causal hypothesis",
      conditions: mechanism?.uncertainty || result.stressTest.missingInformation[0] || "The mechanism depends on evidence not yet available.",
      evidenceIds: mechanismEvidence,
    },
    whatNext: {
      text: `If the documented pathway continues, ${lowerFirst(consequence?.summary || "the next effect may remain conditional")}`,
      timeHorizon: result.stressTest.missingInformation[0] ? `Monitor ${lowerFirst(result.stressTest.missingInformation[0])}.` : "The time horizon is not established.",
      indicators: result.stressTest.changeConditions.slice(0, 3),
      uncertainty: consequence?.uncertainty || result.uncertain[0] || "The outcome is conditional, not predicted.",
      evidenceIds: consequenceEvidence,
    },
    whyYouCare: {
      text: relevance.text,
      userProfile: relevance.profile,
      exposureType: relevance.exposureType,
      conditions: relevance.conditions,
      timeHorizon: relevance.timeHorizon,
      evidenceIds: relevance.evidenceIds,
    },
  };
}

function buildReflectionPrompts(result: CoreAnalysisResult, council: CouncilPerspective[]) {
  const challenger = council.find((item) => item.role === "Challenger");
  const confidenceRank: Record<ConfidenceLevel, number> = { Low: 0, Medium: 1, High: 2 };
  const weakestNode = [...result.nodes].sort((left, right) => confidenceRank[left.confidence] - confidenceRank[right.confidence])[0];
  const headlineAnchor = result.headline.split(/\s+/u).slice(0, 8).join(" ");
  return [
    `For “${headlineAnchor}”, what evidence would resolve this challenge: ${challenger?.uncertainty || result.uncertain[0] || "the missing verification"}?`,
    `Which assumption in “${weakestNode?.title || "the proposed pathway"}” would you test first?`,
    "Are the cited source organisations independent enough for the conclusion you would draw?",
  ];
}

export function deriveResultLayers(result: CoreAnalysisResult, profile: UserProfile = "General reader"): ResultLayers {
  const usableSources = result.sources.filter((source) => isUsable(source, result.mode));
  const contextualSources = result.sources.filter((source) => isInspectableContext(source, result.mode));
  const status = evidenceStatus(result, usableSources);
  const profileRelevance = buildProfileRelevance(result, status);
  const councilPerspectives = buildCouncil(result, status, usableSources, contextualSources, profile, profileRelevance);
  const councilSynthesis = buildSynthesis(result, status, councilPerspectives);
  const submittedIds = new Set(headlineClaims(result).map((claim) => claim.id));
  const hasTraceableHeadlineEvidence = usableSources.some((source) => source.relatedClaims.some((id) => submittedIds.has(id)));
  const auditorApproved = status === "Insufficient"
    ? councilPerspectives.length === 0
    : hasTraceableHeadlineEvidence;
  const bottomLine = buildBottomLine(result, status, usableSources, auditorApproved);
  const visualStory = buildVisualStory(result, status, profile, profileRelevance);
  const reflectionPrompts = buildReflectionPrompts(result, councilPerspectives);
  return { selectedProfile: profile, profileRelevance, bottomLine, visualStory, councilPerspectives, councilSynthesis, reflectionPrompts };
}

function applyGeminiPresentation(result: CoreAnalysisResult, layers: ResultLayers, profile: UserProfile): ResultLayers {
  const analysis = result.aiAnalysis;
  if (!analysis) return layers;
  const profileRelevance = analysis.story.profileRelevance.find((item) => item.profile === profile)
    ?? analysis.story.profileRelevance.find((item) => item.profile === "General reader");
  const whyYouCare = profileRelevance ?? layers.profileRelevance[profile];
  return {
    ...layers,
    selectedProfile: profile,
    bottomLine: {
      ...layers.bottomLine,
      explanation: analysis.bottomLine.explanation,
      evidenceStatus: analysis.verdict,
      keyImplication: analysis.bottomLine.keyImplication,
      keyUncertainty: analysis.bottomLine.keyUncertainty,
    },
    visualStory: {
      whatHappened: analysis.story.whatHappened,
      why: analysis.story.why,
      whatNext: analysis.story.whatNext,
      whyYouCare: {
        text: whyYouCare.text,
        userProfile: profile,
        exposureType: whyYouCare.exposureType,
        conditions: whyYouCare.conditions,
        timeHorizon: whyYouCare.timeHorizon,
        evidenceIds: whyYouCare.evidenceIds,
      },
    },
  };
}

export function enrichAnalysisResult(result: CoreAnalysisResult, profile: UserProfile = "General reader"): AnalysisResult {
  const layers = applyGeminiPresentation(result, deriveResultLayers(result, profile), profile);
  return { ...result, ...layers };
}

export function withUserProfile(result: AnalysisResult, profile: UserProfile): AnalysisResult {
  const layers = applyGeminiPresentation(result, deriveResultLayers(result, profile), profile);
  return { ...result, ...layers };
}

export type ExplanationLanguage = "English" | "Hindi" | "Marathi";

export function explanationPresentation(result: AnalysisResult, language: ExplanationLanguage) {
  if (language === "English") {
    return { text: result.bottomLine.explanation, disclosure: "Audited English explanation", translated: false };
  }
  const translated = result.translatedFrame?.[language];
  if (translated) {
    return {
      text: translated,
      disclosure: "Bottom Line machine translation · evidence detail remains in English · not human-verified",
      translated: true,
    };
  }
  return {
    text: result.bottomLine.explanation,
    disclosure: "Translation unavailable — showing the audited English explanation",
    translated: false,
  };
}

export function sourceInspectorModel(source: EvidenceSource, mode: CoreAnalysisResult["mode"]) {
  const retrievalDepthLabel = source.verificationDepth === "full-text"
    ? "Article text read"
    : source.verificationDepth === "headline-consensus"
    ? "Headline consensus only"
    : source.verificationDepth === "curated-review"
    ? "Curated source review"
    : mode === "curated"
    ? "Curated review · retrieval depth not stored"
    : "Metadata only";
  const excerpt = source.excerpt?.trim() || null;
  const excerptLabel = source.excerptKind === "source-title"
    ? "Relevant source-title text"
    : "Relevant source excerpt";
  return {
    retrievalDepthLabel,
    excerpt,
    excerptLabel,
    excerptAvailabilityLabel: excerpt
      ? source.excerptKind === "source-title"
        ? "Article body unavailable; showing attributable source-title text."
        : "Relevant verbatim excerpt available."
      : "No excerpt available; no verbatim text is stored.",
    translationDisclosure: source.translationDisclosure || "No translation record is stored for this source. Open the original before relying on translated wording.",
  };
}

function allLayerEvidenceIds(result: AnalysisResult) {
  return [
    ...result.bottomLine.evidenceIds,
    ...result.visualStory.whatHappened.evidenceIds,
    ...result.visualStory.why.evidenceIds,
    ...result.visualStory.whatNext.evidenceIds,
    ...result.visualStory.whyYouCare.evidenceIds,
    ...result.councilPerspectives.flatMap((perspective) => perspective.evidenceIds),
    ...result.councilSynthesis.areasOfDisagreement.flatMap((item) => Object.values(item.evidenceByRole).flatMap((ids) => ids ?? [])),
  ];
}

export function auditResultLayers(result: AnalysisResult): string[] {
  const errors: string[] = [];
  const evidenceIds = new Set(result.sources.map((source) => source.id));
  const claimIds = new Set(result.claims.map((claim) => claim.id));
  const sourcesById = new Map(result.sources.map((source) => [source.id, source]));
  for (const id of allLayerEvidenceIds(result)) if (!evidenceIds.has(id)) errors.push(`Unknown evidence ID: ${id}`);
  if (!result.bottomLine.auditorApproved) errors.push("Bottom Line was not approved by the Auditor boundary.");
  if (result.bottomLine.evidenceStatus === "Insufficient") {
    if (result.councilPerspectives.length) errors.push("Insufficient result creates an artificial Council debate.");
    if (result.visualStory.whyYouCare.exposureType !== "No established exposure") errors.push("Insufficient result claims a personal exposure.");
  } else if (!/\b(if|may|might|could|would|monitor|depends?|conditional)\b/i.test(`${result.visualStory.whatNext.text} ${result.visualStory.whatNext.uncertainty}`)) {
    errors.push("What next is not expressed conditionally.");
  }
  if (result.councilPerspectives.length) {
    const roles = result.councilPerspectives.map((perspective) => perspective.role);
    if (new Set(roles).size !== councilRoles.length || councilRoles.some((role) => !roles.includes(role))) errors.push("Council roles are missing or duplicated.");
    for (const perspective of result.councilPerspectives) {
      if (!perspective.evidenceIds.length) errors.push(`${perspective.role} has no evidence.`);
      if (!perspective.claimIds.length) errors.push(`${perspective.role} has no claim.`);
      for (const id of perspective.claimIds) if (!claimIds.has(id)) errors.push(`${perspective.role} cites unknown claim ${id}.`);
    }
  }
  const expectedStageEvidence: Array<[string, string[], string[]]> = [
    ["What happened", result.visualStory.whatHappened.evidenceIds, inspectableNodeEvidence(result, nodeFor(result, "Signal")?.evidenceIds ?? [])],
    ["Why", result.visualStory.why.evidenceIds, inspectableNodeEvidence(result, (nodeFor(result, "Mechanism") ?? nodeFor(result, "Hidden dependency"))?.evidenceIds ?? [])],
    ["What next", result.visualStory.whatNext.evidenceIds, inspectableNodeEvidence(result, nodeFor(result, "Wider consequence")?.evidenceIds ?? [])],
    ["Why you care", result.visualStory.whyYouCare.evidenceIds, inspectableNodeEvidence(result, nodeFor(result, "Relevance")?.evidenceIds ?? [])],
  ];
  for (const [label, actual, expected] of expectedStageEvidence) {
    const allowed = new Set(expected);
    for (const id of actual) if (!allowed.has(id)) errors.push(`${label} cites evidence not linked to its causal node: ${id}`);
  }
  const submittedClaimIds = new Set(headlineClaims(result).map((claim) => claim.id));
  if (result.councilPerspectives.length) {
    const roleEvidence = new Map<CouncilRole, Set<string>>([
      ["Verifier", new Set(result.sources.filter((source) => isUsable(source, result.mode) && source.evidenceRole === "Supports" && source.relatedClaims.some((id) => submittedClaimIds.has(id))).map((source) => source.id))],
      ["Challenger", new Set(result.sources.filter((source) => isInspectableContext(source, result.mode) && (source.evidenceRole === "Contradicts" || source.evidenceRole === "Adds context")).map((source) => source.id))],
      ["Mechanism Analyst", new Set(expectedStageEvidence[1][2])],
      ["Relevance Analyst", new Set(expectedStageEvidence[3][2])],
      ["Auditor", new Set(result.sources.filter((source) => isInspectableContext(source, result.mode)).map((source) => source.id))],
    ]);
    for (const perspective of result.councilPerspectives) {
      const allowed = roleEvidence.get(perspective.role) ?? new Set<string>();
      for (const id of perspective.evidenceIds) if (!allowed.has(id)) errors.push(`${perspective.role} cites evidence outside its role: ${id}`);
    }
  }
  for (const id of result.bottomLine.evidenceIds) {
    const source = sourcesById.get(id);
    if (!source || !isUsable(source, result.mode) || !source.relatedClaims.some((claimId) => submittedClaimIds.has(claimId))) {
      errors.push(`Bottom Line cites evidence unrelated to the submitted claim: ${id}`);
    }
  }
  for (const disagreement of result.councilSynthesis.areasOfDisagreement) {
    const [leftRole, rightRole] = disagreement.roles;
    const left = unique(disagreement.evidenceByRole[leftRole] ?? []).sort();
    const right = unique(disagreement.evidenceByRole[rightRole] ?? []).sort();
    if (!left.length || !right.length || JSON.stringify(left) === JSON.stringify(right)) {
      errors.push(`Council disagreement lacks distinct evidence: ${leftRole} / ${rightRole}`);
    }
  }
  if (/\bmajority\b|\bvote\b|\bvoting\b|\boutvoted\b/i.test(JSON.stringify(result.councilSynthesis))) errors.push("Council synthesis uses voting language.");
  if (result.reflectionPrompts.length < 2 || result.reflectionPrompts.length > 3) errors.push("Form Your View must contain two or three prompts.");
  return unique(errors);
}
