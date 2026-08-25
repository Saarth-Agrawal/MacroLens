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
  return enrichAnalysisResult({ ...result, nodes: [signal, ...safeNodes], aiAnalysis: { ...analysis, nodes: safeNodes } }, result.selectedProfile);
}
