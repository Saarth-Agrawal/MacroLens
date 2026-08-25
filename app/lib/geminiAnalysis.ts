import type { AnalysisResult, CausalNode, GeminiAnalysis, NodeLayer } from "../data/demoCases";
import { enrichAnalysisResult } from "./resultExperience.ts";

const generatedLayers: NodeLayer[] = ["Mechanism", "Hidden dependency", "Wider consequence", "Relevance"];

export function applyGeminiAnalysis(result: AnalysisResult, analysis: GeminiAnalysis): AnalysisResult {
  const signal = result.nodes.find((node) => node.layer === "Signal");
  const safeNodes: CausalNode[] = analysis.nodes.filter((node) => generatedLayers.includes(node.layer)).map((node) => ({
    ...node,
    id: node.layer === "Mechanism" ? "mechanism" : node.layer === "Hidden dependency" ? "dependency" : node.layer === "Wider consequence" ? "consequence" : "relevance",
    kind: "Causal hypothesis",
    confidence: "Low",
    evidenceIds: [],
  }));
  if (!signal || safeNodes.length !== 4) return result;
  const claimAssessments = new Map(analysis.claimAssessments.map((item) => [item.id, item]));
  const sourceAssessments = new Map(analysis.sourceAssessments.map((item) => [item.id, item]));
  const claims = result.claims.map((claim) => {
    const assessment = claimAssessments.get(claim.id);
    return assessment ? { ...claim, kind: assessment.kind, evidenceIds: assessment.evidenceIds } : claim;
  });
  const sources = result.sources.map((source) => {
    const assessment = sourceAssessments.get(source.id);
    return assessment ? { ...source, evidenceRole: assessment.evidenceRole, relatedClaims: assessment.relatedClaims, note: assessment.note } : source;
  });
  return enrichAnalysisResult({
    ...result,
    shortFrame: analysis.bottomLine.explanation,
    claims,
    sources,
    confirmed: claims.filter((claim) => claim.kind === "Confirmed fact").map((claim) => claim.text),
    uncertain: [analysis.bottomLine.keyUncertainty, ...analysis.synthesis.unresolvedQuestions],
    nodes: [signal, ...safeNodes],
    whyItMatters: analysis.whyItMatters,
    winners: analysis.winners,
    losers: analysis.losers,
    stressTest: analysis.stressTest,
    confidence: analysis.confidence,
    aiAnalysis: { ...analysis, nodes: safeNodes },
  }, result.selectedProfile);
}
