"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { demoCases, findDemoCase, type AnalysisResult, type CausalNode, type EvidenceSource, type StatementKind } from "./data/demoCases";
import { buildLiveAnalysis, detectLanguage, type RetrievedArticle } from "./lib/analysis";
import { cropCanvas, prepareDocumentImage } from "./lib/documentImage";
import { buildEconomicLensQuery } from "./lib/economicLens";
import { bodyTextWarning, buildHeadlineCandidates, chooseVisualConfusableAlternative, cleanOcrText, mergeLayoutAndDetail, validateHeadline, type CropRegion, type HeadlineCandidate, type OcrLineBox } from "./lib/headlineOcr";

type ExplanationLanguage = "English" | "Hindi" | "Marathi";
type InputMode = "text" | "lens";
type PipelineStage = "Ready" | "Reading image" | "Decomposing claims" | "Retrieving evidence" | "Linking evidence" | "Complete" | "Fallback ready";
type CropDrag = { mode: "new" | "move" | "resize"; startX: number; startY: number; start: CropRegion; corner?: "nw" | "ne" | "sw" | "se" };

const stageOrder: PipelineStage[] = ["Decomposing claims", "Retrieving evidence", "Linking evidence", "Complete"];
const fullPageCrop: CropRegion = { left: 0, top: 0, width: 100, height: 100 };

function analysisInputKey(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

const labels: Record<ExplanationLanguage, { output: string }> = {
  English: { output: "Explanation language" },
  Hindi: { output: "व्याख्या की भाषा" },
  Marathi: { output: "स्पष्टीकरणाची भाषा" },
};

function kindClass(kind: StatementKind) {
  if (kind === "Confirmed fact") return "confirmed";
  if (kind === "Evidence-supported inference") return "inference";
  if (kind === "Causal hypothesis") return "hypothesis";
  return "unverified";
}

function roleClass(role: EvidenceSource["evidenceRole"]) {
  if (role === "Supports") return "supports";
  if (role === "Contradicts") return "contradicts";
  if (role === "Adds context") return "context";
  return "insufficient";
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function ScanPreview({ src }: { src: string }) {
  // A temporary browser blob URL cannot be routed through the hosted image optimiser.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="scan-preview" src={src} alt="Newspaper scan preview" />;
}

async function retrieveDirectFromGdelt(query: string, externalSignal?: AbortSignal): Promise<RetrievedArticle[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6500);
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=8&format=json&sort=datedesc&timespan=1month`;
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`GDELT returned ${response.status}`);
    const payload = await response.json() as { articles?: Array<{ title?: string; url?: string; domain?: string; seendate?: string }> };
    return (payload.articles ?? []).slice(0, 8).flatMap((article) => {
      const title = article.title?.trim();
      const url = article.url?.trim();
      if (!title || !url || !/^https?:\/\//i.test(url)) return [];
      const rawDate = article.seendate || "";
      const date = /^\d{8}/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : "Date unavailable";
      const publisher = article.domain?.replace(/^www\./, "") || "News publisher";
      return [{ title: title.slice(0, 240), url, publisher, domain: publisher, date }];
    });
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

export default function Home() {
  const [headline, setHeadline] = useState(demoCases[0].headline);
  const [result, setResult] = useState<AnalysisResult>(demoCases[0]);
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [explanationLanguage, setExplanationLanguage] = useState<ExplanationLanguage>("English");
  const [ocrLanguage, setOcrLanguage] = useState<ExplanationLanguage>("English");
  const [selectedNodeId, setSelectedNodeId] = useState("signal");
  const [selectedSourceId, setSelectedSourceId] = useState("S1");
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("Ready");
  const [pipelineNote, setPipelineNote] = useState("Three pre-verified demos are ready. Any custom headline can be examined through the business and economics lens.");
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [resultIsFresh, setResultIsFresh] = useState(true);
  const [imageName, setImageName] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAspect, setImageAspect] = useState(1);
  const [cropRegion, setCropRegion] = useState<CropRegion>(fullPageCrop);
  const [headlineCandidates, setHeadlineCandidates] = useState<HeadlineCandidate[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState("");
  const [headlineSelectionConfidence, setHeadlineSelectionConfidence] = useState<number | null>(null);
  const [ocrCharacterConfidence, setOcrCharacterConfidence] = useState<number | null>(null);
  const [headlinePlausible, setHeadlinePlausible] = useState(false);
  const [manualSelection, setManualSelection] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [ocrStatus, setOcrStatus] = useState("Choose a clear newspaper image. Processing stays in this browser.");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrConfirmed, setOcrConfirmed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // A language change and an immediate upload can occur in the same browser
  // task. React state is intentionally asynchronous, so the OCR pipeline must
  // read a synchronously updated ref or it can start with the previous
  // language (for example, English after the user selected Hindi).
  const ocrLanguageRef = useRef<ExplanationLanguage>("English");
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const headlineInputRef = useRef<HTMLTextAreaElement>(null);
  const cropSurfaceRef = useRef<HTMLDivElement>(null);
  const preparedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef<CropDrag | null>(null);
  const previewUrlRef = useRef("");
  const lastDirectRetrievalRef = useRef(0);
  const analysisRunRef = useRef(0);
  const activeRetrievalControllerRef = useRef<AbortController | null>(null);

  const selectedNode = useMemo(() => result.nodes.find((node) => node.id === selectedNodeId) ?? result.nodes[0], [result, selectedNodeId]);
  const selectedSource = useMemo(() => result.sources.find((source) => source.id === selectedSourceId) ?? result.sources[0], [result, selectedSourceId]);
  const linkedSources = useMemo(() => result.sources.filter((source) => selectedNode?.evidenceIds.includes(source.id)), [result, selectedNode]);
  const confirmedEvidenceIds = useMemo(() => [...new Set(result.claims.filter((claim) => claim.kind === "Confirmed fact").flatMap((claim) => claim.evidenceIds))], [result]);
  const relevanceNode = useMemo(() => result.nodes.find((node) => node.layer === "Relevance"), [result]);
  const stressSources = useMemo(() => result.sources.filter((source) => source.evidenceRole === "Contradicts" || source.evidenceRole === "Adds context"), [result]);
  const detectedInputLanguage = useMemo(() => detectLanguage(headline), [headline]);
  const translatedFrame = explanationLanguage === "English" ? result.shortFrame : result.translatedFrame?.[explanationLanguage];
  const requiresOcrConfirmation = Boolean(imageName) && (!ocrConfirmed || !headlinePlausible);
  const hasCurrentResult = resultIsFresh && analysisInputKey(headline) === analysisInputKey(result.headline);
  const retrievalUnavailable = hasCurrentResult && result.mode === "live" && result.sources.length === 0;
  const readSourceCount = result.sources.filter((source) => source.verificationDepth === "full-text").length;
  const resultStateLabel = !hasCurrentResult
    ? isAnalysing ? "ANALYSIS IN PROGRESS" : "ANALYSIS PENDING"
    : result.mode === "curated"
    ? "CURATED DEMO · PRE-VERIFIED"
    : readSourceCount
    ? "PUBLIC SOURCE TEXT READ"
    : result.sources.length
    ? "METADATA ONLY RETRIEVED"
    : "LIVE RETRIEVAL UNAVAILABLE";
  const resultStateClass = !hasCurrentResult
    ? "pending"
    : retrievalUnavailable
    ? "unavailable"
    : result.mode === "live"
    ? "metadata"
    : "";
  const hasEvidenceConflict = result.sources.some((source) => source.evidenceRole === "Contradicts");
  const hasSupportedSignal = result.claims.some((claim) => claim.kind === "Confirmed fact" || claim.kind === "Evidence-supported inference");
  const canRenderCausalSurface = result.mode === "curated" || (!hasEvidenceConflict && hasSupportedSignal);

  useEffect(() => () => {
    analysisRunRef.current += 1;
    activeRetrievalControllerRef.current?.abort();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const cancelPendingAnalysis = () => {
    analysisRunRef.current += 1;
    activeRetrievalControllerRef.current?.abort();
    activeRetrievalControllerRef.current = null;
    setIsAnalysing(false);
    return analysisRunRef.current;
  };

  const invalidateCurrentResult = () => {
    cancelPendingAnalysis();
    setResultIsFresh(false);
  };

  const resetInput = () => {
    invalidateCurrentResult();
    setHeadline("");
    setImageName("");
    setImagePreview("");
    setImageFile(null);
    setImageAspect(1);
    setCropRegion(fullPageCrop);
    setHeadlineCandidates([]);
    setActiveCandidateId("");
    setHeadlineSelectionConfidence(null);
    setOcrCharacterConfidence(null);
    setHeadlinePlausible(false);
    setManualSelection(false);
    setCropZoom(1);
    setOcrConfirmed(false);
    setOcrProgress(0);
    setOcrStatus("Choose a clear newspaper image. Processing stays in this browser.");
    setErrorMessage("");
    setPipelineStage("Ready");
    setPipelineNote("Enter any headline. MacroLens will examine its business and economic implications.");
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    preparedCanvasRef.current = null;
    if (uploadRef.current) uploadRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const selectDemo = (demo: AnalysisResult) => {
    cancelPendingAnalysis();
    setHeadline(demo.headline);
    setResult(demo);
    setResultIsFresh(true);
    setSelectedNodeId(demo.nodes[0].id);
    setSelectedSourceId(demo.sources[0]?.id || "");
    setPipelineStage("Complete");
    setPipelineNote("Curated demo case loaded. It is pre-verified and is not represented as live retrieval.");
    setInputMode("text");
    setImageName("");
    setImagePreview("");
    setImageFile(null);
    setHeadlineCandidates([]);
    setActiveCandidateId("");
    setHeadlineSelectionConfidence(null);
    setOcrCharacterConfidence(null);
    setHeadlinePlausible(true);
    setOcrConfirmed(false);
    setErrorMessage("");
    setMobileNavOpen(false);
  };

  const retrieveArticles = async (query: string, controller: AbortController) => {
    const timer = window.setTimeout(() => controller.abort(), 11000);
    activeRetrievalControllerRef.current = controller;
    try {
      const response = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Retrieval returned ${response.status}`);
      const payload = await response.json() as { articles?: RetrievedArticle[]; provider?: string; limitation?: string; diagnostics?: Record<string, string> };
      if (payload.articles?.length) return { articles: payload.articles, provider: payload.provider || "Public headline feed", limitation: payload.limitation };

      const cooldown = Math.max(0, 5500 - (Date.now() - lastDirectRetrievalRef.current));
      if (cooldown) await sleep(cooldown);
      if (controller.signal.aborted) throw new DOMException("Analysis cancelled", "AbortError");
      lastDirectRetrievalRef.current = Date.now();
      try {
        const directArticles = await retrieveDirectFromGdelt(buildEconomicLensQuery(query), controller.signal);
        if (directArticles.length) return { articles: directArticles, provider: "GDELT DOC 2.0 · direct browser fallback", limitation: undefined };
      } catch { /* preserve the server's explicit unavailable state */ }

      const diagnosticText = payload.diagnostics ? Object.entries(payload.diagnostics).map(([provider, status]) => `${provider}: ${status}`).join(" · ") : "provider diagnostics unavailable";
      return { articles: [], provider: payload.provider || "offline", limitation: `${payload.limitation || "LIVE RETRIEVAL UNAVAILABLE. No curated evidence has been substituted."} Feed status: ${diagnosticText}.` };
    } finally {
      window.clearTimeout(timer);
      if (activeRetrievalControllerRef.current === controller) activeRetrievalControllerRef.current = null;
    }
  };

  const runAnalysis = async () => {
    const cleanHeadline = headline.trim();
    if (!cleanHeadline) {
      setErrorMessage("Type a headline or scan one before analysing.");
      return;
    }
    const headlineValidation = validateHeadline(cleanHeadline, headlineSelectionConfidence ?? 100, Boolean(imageName));
    if (!headlineValidation.plausible) {
      setErrorMessage(headlineValidation.warning || bodyTextWarning);
      return;
    }
    if (requiresOcrConfirmation) {
      setErrorMessage("Check the OCR text and choose “Use corrected text” before analysis.");
      return;
    }

    const demo = findDemoCase(cleanHeadline);

    const runId = cancelPendingAnalysis();
    setIsAnalysing(true);
    setResultIsFresh(false);
    setErrorMessage("");
    setPipelineStage("Decomposing claims");
    setPipelineNote("Separating the headline into individually checkable claims…");

    if (demo) {
      await sleep(420);
      if (analysisRunRef.current !== runId) return;
      setPipelineStage("Linking evidence");
      setPipelineNote("Loading the fixed, dated source ledger for this curated case…");
      await sleep(420);
      if (analysisRunRef.current !== runId) return;
      setResult(demo);
      setResultIsFresh(true);
      setSelectedNodeId(demo.nodes[0].id);
      setSelectedSourceId(demo.sources[0].id);
      setPipelineStage("Complete");
      setPipelineNote("Curated demo case loaded. It is pre-verified and is not represented as live retrieval.");
      setIsAnalysing(false);
      document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    try {
      setPipelineStage("Retrieving evidence");
      setPipelineNote("Searching public source text for the headline and its business and economic implications…");
      const retrievalController = new AbortController();
      const retrieval = await retrieveArticles(cleanHeadline, retrievalController);
      if (analysisRunRef.current !== runId) return;
      setPipelineStage("Linking evidence");
      setPipelineNote("Checking source eligibility, support, contradiction and evidence gaps…");
      const liveResult = buildLiveAnalysis(cleanHeadline, retrieval.articles);
      setResult(liveResult);
      setResultIsFresh(true);
      setSelectedNodeId(liveResult.nodes[0].id);
      setSelectedSourceId(liveResult.sources[0]?.id || "");
      setPipelineStage(retrieval.articles.length ? "Complete" : "Fallback ready");
      setPipelineNote(retrieval.articles.length
        ? `LIVE ANALYSIS · ${retrieval.provider}: ${retrieval.articles.length} recent result${retrieval.articles.length === 1 ? "" : "s"}. Unrated sites and metadata-only results do not affect confidence.`
        : retrieval.limitation || "No close public evidence was retrieved. The insufficient-evidence safeguard is active.");
    } catch {
      if (analysisRunRef.current !== runId) return;
      const fallback = buildLiveAnalysis(cleanHeadline, []);
      setResult(fallback);
      setResultIsFresh(true);
      setSelectedNodeId(fallback.nodes[0].id);
      setSelectedSourceId("");
      setPipelineStage("Fallback ready");
      setPipelineNote("Live retrieval failed. No blank screen and no invented answer: use Retry or one of the curated demos.");
    } finally {
      if (analysisRunRef.current !== runId) return;
      setIsAnalysing(false);
      window.setTimeout(() => document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
    }
  };

  const readHeadlineCandidate = async (candidate: HeadlineCandidate, suppliedWorker?: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>, isManual = false) => {
    const prepared = preparedCanvasRef.current;
    if (!prepared) throw new Error("Prepared image unavailable");
    setErrorMessage("");
    setOcrConfirmed(false);
    setHeadlinePlausible(false);
    setOcrBusy(true);
    setPipelineStage("Reading image");
    setOcrStatus("Stage 2 of 2 · reading only the selected headline region…");
    setCropRegion(candidate.region);
    setActiveCandidateId(candidate.id);
    setHeadlineSelectionConfidence(isManual ? null : candidate.selectionConfidence);

    let worker = suppliedWorker ?? null;
    try {
      const { createWorker, PSM } = await import("tesseract.js");
      const ocrCode: Record<ExplanationLanguage, "eng" | "hin" | "mar"> = { English: "eng", Hindi: "hin", Marathi: "mar" };
      const activeOcrLanguage = ocrLanguageRef.current;
      if (!worker) worker = await createWorker(ocrCode[activeOcrLanguage], undefined, {
        logger: (message) => {
          if (typeof message.progress === "number") setOcrProgress(Math.max(3, Math.min(98, Math.round(message.progress * 100))));
          if (message.status) setOcrStatus(`Stage 2 of 2 · ${message.status.replace(/_/g, " ")}`);
        },
      });
      const selectedCanvas = cropCanvas(prepared, candidate.region);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1", user_defined_dpi: "300" });
      const blockPass = await worker.recognize(selectedCanvas);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1", user_defined_dpi: "300" });
      const sparsePass = await worker.recognize(selectedCanvas);
      const blockText = cleanOcrText(blockPass.data.text);
      const sparseText = cleanOcrText(sparsePass.data.text);
      const detailText = sparseText && sparseText.length <= Math.max(180, blockText.length * 1.35) ? sparseText : blockText;
      let lineText = "";
      const lineConfidences: number[] = [];
      if (!isManual && candidate.lineRegions.length > 1 && candidate.lineRegions.length <= 4) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1", user_defined_dpi: "300" });
        const lineResults: string[] = [];
        for (const lineRegion of candidate.lineRegions) {
          // Separate line passes exclude newspaper artwork and neighbouring columns,
          // while preserving small matras that disappear in a whole-block pass.
          const lineCanvas = cropCanvas(prepared, lineRegion, 900);
          const linePass = await worker.recognize(lineCanvas);
          let value = cleanOcrText(linePass.data.text);
          let lineConfidence = linePass.data.confidence;
          // Halftone newspaper grain can be hallucinated as an anusvara. When
          // the normal pass contains one, compare it with a constrained pass;
          // accept the alternative only when the texts otherwise match and its
          // confidence is not materially worse. This is an OCR ensemble, not a
          // headline-specific replacement.
          if (activeOcrLanguage !== "English" && value.includes("ं")) {
            await worker.setParameters({ tessedit_char_blacklist: "ं" });
            const noAnusvaraPass = await worker.recognize(lineCanvas);
            await worker.setParameters({ tessedit_char_blacklist: "" });
            const alternative = cleanOcrText(noAnusvaraPass.data.text);
            const selectedValue = chooseVisualConfusableAlternative(value, alternative, linePass.data.confidence, noAnusvaraPass.data.confidence);
            if (selectedValue !== value) {
              value = selectedValue;
              lineConfidence = noAnusvaraPass.data.confidence;
            }
          }
          if (value) lineResults.push(value);
          if (Number.isFinite(lineConfidence)) lineConfidences.push(lineConfidence);
        }
        lineText = cleanOcrText(lineResults.join(" "));
      }
      const extracted = (lineText
        ? mergeLayoutAndDetail(lineText, detailText)
        : mergeLayoutAndDetail(candidate.textHint, detailText)).slice(0, 500);
      if (!extracted) throw new Error("No readable headline");
      const confidenceValues = [blockPass.data.confidence, sparsePass.data.confidence, ...lineConfidences].filter(Number.isFinite);
      const characterConfidence = Math.min(99, Math.max(0, Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / Math.max(1, confidenceValues.length))));
      const validation = validateHeadline(extracted, isManual ? 100 : candidate.selectionConfidence);
      if (characterConfidence < 42) {
        validation.plausible = false;
        validation.reasons.push("OCR character confidence is unusually low");
        validation.warning = bodyTextWarning;
      }
      if (!isManual && candidate.lineCount >= 4 && extracted.length > 90) {
        validation.plausible = false;
        validation.reasons.push("covers too many dense headline-like lines");
        validation.warning = bodyTextWarning;
      }
      const coversMostOfPage = candidate.region.width * candidate.region.height > 5200;
      if (coversMostOfPage) {
        validation.plausible = false;
        validation.reasons.push("covers several distant text regions");
        validation.warning = bodyTextWarning;
      }
      invalidateCurrentResult();
      setHeadline(extracted);
      setOcrCharacterConfidence(characterConfidence);
      setOcrProgress(100);
      setHeadlinePlausible(validation.plausible);
      if (validation.plausible) {
        setOcrStatus("Primary headline candidate extracted. Check the text, then confirm once before analysis.");
        setPipelineStage("Ready");
      } else {
        setOcrStatus(validation.warning);
        setErrorMessage(validation.warning);
        setPipelineStage("Fallback ready");
      }
    } finally {
      if (!suppliedWorker && worker) await worker.terminate();
      setOcrBusy(false);
    }
  };

  const detectAndReadHeadline = async (prepared: HTMLCanvasElement) => {
    invalidateCurrentResult();
    setErrorMessage("");
    setHeadline("");
    setHeadlineCandidates([]);
    setActiveCandidateId("");
    setOcrConfirmed(false);
    setHeadlinePlausible(false);
    setManualSelection(false);
    setOcrBusy(true);
    setOcrProgress(2);
    setPipelineStage("Reading image");
    setOcrStatus("Stage 1 of 2 · detecting visually prominent headline regions…");

    let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | null = null;
    try {
      const { createWorker, PSM } = await import("tesseract.js");
      const ocrCode: Record<ExplanationLanguage, "eng" | "hin" | "mar"> = { English: "eng", Hindi: "hin", Marathi: "mar" };
      const activeOcrLanguage = ocrLanguageRef.current;
      worker = await createWorker(ocrCode[activeOcrLanguage], undefined, {
        logger: (message) => {
          if (typeof message.progress === "number") setOcrProgress(Math.max(2, Math.min(48, Math.round(message.progress * 48))));
          if (message.status) setOcrStatus(`Stage 1 of 2 · ${message.status.replace(/_/g, " ")}`);
        },
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1", user_defined_dpi: "300" });
      const layout = await worker.recognize(prepared, {}, { blocks: true, text: true });
      const lines: OcrLineBox[] = (layout.data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => ({
        text: line.text,
        confidence: line.confidence,
        bbox: line.bbox,
        rowHeight: line.rowAttributes?.rowHeight,
      }))));
      const candidates = buildHeadlineCandidates(lines, prepared.width, prepared.height, activeOcrLanguage);
      if (!candidates.length) throw new Error("No headline candidate");
      setHeadlineCandidates(candidates);
      setCropRegion(candidates[0].region);
      setActiveCandidateId(candidates[0].id);
      setHeadlineSelectionConfidence(candidates[0].selectionConfidence);
      setOcrProgress(50);
      await readHeadlineCandidate(candidates[0], worker, false);
    } catch {
      setOcrProgress(0);
      setHeadline("");
      setHeadlinePlausible(false);
      setOcrStatus("No reliable headline region was detected. Draw a box around one headline or type it manually.");
      setErrorMessage(bodyTextWarning);
      setPipelineStage("Fallback ready");
    } finally {
      if (worker) await worker.terminate();
      setOcrBusy(false);
    }
  };

  const processImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      const message = "That file is not a supported image. Choose a JPG, PNG, WEBP or phone photo.";
      setOcrStatus(message);
      setErrorMessage(message);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      const message = "This image is over 8 MB. Crop or compress it, then try again.";
      setOcrStatus(message);
      setErrorMessage(message);
      return;
    }

    invalidateCurrentResult();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    setImageFile(file);
    setImageName(file.name || "Camera scan");
    setCropRegion(fullPageCrop);
    setHeadlineCandidates([]);
    setOcrCharacterConfidence(null);
    setHeadlineSelectionConfidence(null);
    setCropZoom(1);
    setInputMode("lens");
    setOcrStatus("Preparing document · trimming margins, correcting skew and increasing contrast…");
    setOcrBusy(true);
    try {
      const prepared = await prepareDocumentImage(file);
      preparedCanvasRef.current = prepared.canvas;
      setImagePreview(prepared.previewUrl);
      setImageAspect(prepared.aspect);
      setOcrStatus(`Document prepared${prepared.skewDegrees ? ` · corrected ${Math.abs(prepared.skewDegrees).toFixed(1)}° skew` : " · orientation checked"}. Detecting headline regions…`);
      await detectAndReadHeadline(prepared.canvas);
    } catch {
      setImagePreview("");
      preparedCanvasRef.current = null;
      setOcrStatus("The image could not be prepared. Try a JPG, PNG or WEBP, or type the headline manually.");
      setPipelineStage("Fallback ready");
    } finally {
      setOcrBusy(false);
    }
  };

  const selectCandidate = async (candidate: HeadlineCandidate) => {
    setManualSelection(false);
    setHeadlineSelectionConfidence(candidate.selectionConfidence);
    await readHeadlineCandidate(candidate, undefined, false);
  };

  const readManualSelection = async () => {
    setManualSelection(true);
    setHeadlineSelectionConfidence(null);
    await readHeadlineCandidate({ id: "manual-selection", textHint: "", region: cropRegion, lineRegions: [], selectionConfidence: 100, score: 1, lineCount: 1 }, undefined, true);
  };

  const cropPoint = (event: ReactPointerEvent<HTMLElement>) => {
    const bounds = cropSurfaceRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100)),
    };
  };

  const beginCrop = (event: ReactPointerEvent<HTMLElement>, mode: CropDrag["mode"], corner?: CropDrag["corner"]) => {
    const point = cropPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = { mode, startX: point.x, startY: point.y, start: mode === "new" ? { left: point.x, top: point.y, width: 0, height: 0 } : cropRegion, corner };
    if (mode === "new") setCropRegion({ left: point.x, top: point.y, width: 0.5, height: 0.5 });
    setManualSelection(true);
    setActiveCandidateId("");
    setHeadlineSelectionConfidence(null);
    setOcrConfirmed(false);
  };

  const moveCrop = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current;
    if (!drag) return;
    const point = cropPoint(event);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (drag.mode === "new") {
      setCropRegion({ left: Math.min(drag.startX, point.x), top: Math.min(drag.startY, point.y), width: Math.max(1, Math.abs(dx)), height: Math.max(1, Math.abs(dy)) });
      return;
    }
    if (drag.mode === "move") {
      setCropRegion({ ...drag.start, left: Math.max(0, Math.min(100 - drag.start.width, drag.start.left + dx)), top: Math.max(0, Math.min(100 - drag.start.height, drag.start.top + dy)) });
      return;
    }
    let left = drag.start.left;
    let top = drag.start.top;
    let right = drag.start.left + drag.start.width;
    let bottom = drag.start.top + drag.start.height;
    if (drag.corner?.includes("w")) left = Math.min(right - 2, Math.max(0, drag.start.left + dx));
    if (drag.corner?.includes("e")) right = Math.max(left + 2, Math.min(100, right + dx));
    if (drag.corner?.includes("n")) top = Math.min(bottom - 2, Math.max(0, drag.start.top + dy));
    if (drag.corner?.includes("s")) bottom = Math.max(top + 2, Math.min(100, bottom + dy));
    setCropRegion({ left, top, width: right - left, height: bottom - top });
  };

  const endCrop = () => { cropDragRef.current = null; };

  const selectNode = (node: CausalNode) => {
    setSelectedNodeId(node.id);
    if (node.evidenceIds[0]) setSelectedSourceId(node.evidenceIds[0]);
  };

  return (
    <main id="top">
      <header className="site-nav glass">
        <a className="brand" href="#top" aria-label="MacroLens home">
          <span className="brand-mark" aria-hidden="true">ML</span>
          <span><strong>MacroLens</strong><small>Evidence-linked media intelligence</small></span>
        </a>
        <button className="mobile-nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded={mobileNavOpen} aria-controls="primary-navigation" onClick={() => setMobileNavOpen((open) => !open)}>Menu</button>
        <nav id="primary-navigation" className={mobileNavOpen ? "open" : ""} aria-label="Primary navigation"><a href="#workspace" onClick={() => setMobileNavOpen(false)}>Analyse</a><a href="#analysis-result" onClick={() => setMobileNavOpen(false)}>Result</a><a href="#method" onClick={() => setMobileNavOpen(false)}>Method</a></nav>
        <span className="competition-chip"><i /> Competition MVP</span>
      </header>

      <section className="intro-shell">
        <div className="intro-copy">
          <p className="eyebrow">SIGNAL <span>→</span> MECHANISM <span>→</span> RELEVANCE</p>
          <h1>Understand the economic system <em>behind any headline.</em></h1>
          <p>MacroLens accepts any headline, separates its checkable claims and examines only evidence-linked business and economic pathways—without pretending every related article proves the story.</p>
          <div className="hero-actions">
            <button className="live-lens-button" onClick={() => { resetInput(); setInputMode("lens"); window.setTimeout(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20); }}>Try the Live Lens <span>↗</span></button>
            <div className="hero-demos"><span>Or run a prepared case</span>{demoCases.map((demo, index) => <button key={demo.id} onClick={() => { selectDemo(demo); window.setTimeout(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20); }}>0{index + 1}</button>)}</div>
          </div>
        </div>
        <div className="trust-protocol" aria-label="MacroLens reliability protocol">
          <span>01</span><p><b>Claims first</b><small>One headline becomes checkable statements.</small></p>
          <span>02</span><p><b>Evidence linked</b><small>Every strong statement opens its source trail.</small></p>
          <span>03</span><p><b>Uncertainty visible</b><small>No universal true-or-false verdict.</small></p>
        </div>
      </section>

      <section className="workspace-shell" id="workspace">
        <div className="workspace-heading">
          <div><span className="section-index">01 / THE LENS</span><h2>Point. Scan. See the system.</h2></div>
          <p>Designed for a reliable 45-second demonstration. Curated cases are fixed; every custom headline is examined through a business and economics lens.</p>
        </div>

        <div className="input-dock glass">
          <div className="input-tabs" role="tablist" aria-label="Headline input method">
            <button className={inputMode === "text" ? "active" : ""} onClick={() => setInputMode("text")} role="tab" aria-selected={inputMode === "text"}>Type or paste</button>
            <button className={inputMode === "lens" ? "active" : ""} onClick={() => setInputMode("lens")} role="tab" aria-selected={inputMode === "lens"}>Upload or scan</button>
          </div>

          <div className={`input-layout ${inputMode === "lens" ? "lens-active" : ""}`}>
            <div className="headline-field">
              <div className="field-label"><label htmlFor="headline">Any headline or claim</label><span>Source language: {detectedInputLanguage}</span></div>
              <textarea ref={headlineInputRef} id="headline" rows={4} value={headline} onChange={(event) => {
                const value = event.target.value.slice(0, 500);
                invalidateCurrentResult();
                setHeadline(value);
                setErrorMessage("");
                setPipelineStage("Ready");
                setPipelineNote("Headline ready. MacroLens will search for its business and economic implications.");
                if (imageName) {
                  setOcrConfirmed(false);
                  const validation = validateHeadline(value, headlineSelectionConfidence ?? 100, true);
                  setHeadlinePlausible(validation.plausible);
                  if (!validation.plausible && value.trim()) setOcrStatus(validation.warning);
                }
              }} placeholder="Paste any headline or claim…" maxLength={500} aria-describedby="headline-scope headline-count" />
              <p className="scope-hint" id="headline-scope">Any topic accepted · analysis stays focused on business and economics</p>
              <div id="headline-count" className="field-actions"><span>{headline.length}/500</span><button onClick={resetInput}>Clear input</button></div>
            </div>

            <div className={`lens-panel ${inputMode === "lens" ? "visible" : ""}`}>
              <input ref={uploadRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={processImage} />
              <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={processImage} />
              <div className="scan-controls">
                <div className="ocr-language-row"><strong>{imageName || "Scan a printed headline"}</strong><label>OCR language<select aria-label="OCR language" value={ocrLanguage} onChange={(event) => {
                  const language = event.target.value as ExplanationLanguage;
                  ocrLanguageRef.current = language;
                  setOcrLanguage(language);
                }} disabled={ocrBusy}><option>English</option><option>Hindi</option><option>Marathi</option></select></label></div>
                <p>{ocrStatus}</p>
                <div className="scan-buttons"><button onClick={() => uploadRef.current?.click()} disabled={ocrBusy}>Upload image</button><button onClick={() => cameraRef.current?.click()} disabled={ocrBusy}>Open camera</button></div>
              </div>
              {!imagePreview && <div className="scan-frame" aria-hidden="true"><i /><span>HEADLINE</span></div>}
              {imagePreview && imageFile && <div className="crop-workbench">
                <div className="crop-toolbar"><div><strong>Headline detector</strong><span>Drag to draw · drag the box to move · resize from any corner</span></div><div className="zoom-controls" aria-label="Image zoom"><button onClick={() => setCropZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} disabled={cropZoom <= 1}>−</button><span>{Math.round(cropZoom * 100)}%</span><button onClick={() => setCropZoom((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))} disabled={cropZoom >= 2.5}>+</button></div></div>
                <div className="crop-viewport">
                  <div ref={cropSurfaceRef} className="crop-surface" style={{ width: `${cropZoom * 100}%`, aspectRatio: imageAspect }} onPointerDown={(event) => beginCrop(event, "new")} onPointerMove={moveCrop} onPointerUp={endCrop} onPointerCancel={endCrop}>
                    <ScanPreview src={imagePreview} />
                    {headlineCandidates.map((candidate, index) => <button key={candidate.id} data-line-regions={JSON.stringify(candidate.lineRegions)} className={`candidate-box ${activeCandidateId === candidate.id ? "active" : ""}`} style={{ left: `${candidate.region.left}%`, top: `${candidate.region.top}%`, width: `${candidate.region.width}%`, height: `${candidate.region.height}%` }} onPointerDown={(event) => event.stopPropagation()} onClick={() => selectCandidate(candidate)} aria-label={`Select suggested headline ${index + 1}`}><span>{index + 1}</span></button>)}
                    <div className="crop-selection" style={{ left: `${cropRegion.left}%`, top: `${cropRegion.top}%`, width: `${cropRegion.width}%`, height: `${cropRegion.height}%` }} onPointerDown={(event) => { event.stopPropagation(); beginCrop(event, "move"); }}>
                      {(["nw", "ne", "sw", "se"] as const).map((corner) => <button key={corner} className={`crop-handle ${corner}`} aria-label={`Resize ${corner} corner`} onPointerDown={(event) => { event.stopPropagation(); beginCrop(event, "resize", corner); }} />)}
                    </div>
                  </div>
                </div>
                <div className="candidate-strip"><span>Suggested headlines</span>{headlineCandidates.length ? headlineCandidates.map((candidate, index) => <button key={candidate.id} className={activeCandidateId === candidate.id ? "active" : ""} onClick={() => selectCandidate(candidate)} disabled={ocrBusy}><b>0{index + 1}</b><span>{candidate.textHint.slice(0, 54) || "Detected text region"}</span><small>{candidate.selectionConfidence}% selection confidence</small></button>) : <small>No reliable automatic candidate yet. Draw a box around one headline.</small>}</div>
                <div className="crop-actions"><button onClick={() => { setCropRegion(fullPageCrop); setManualSelection(true); setActiveCandidateId(""); }} disabled={ocrBusy}>Select full page</button><button onClick={readManualSelection} disabled={ocrBusy || cropRegion.width < 2 || cropRegion.height < 2}>Read drawn selection</button></div>
              </div>}
              {(ocrBusy || ocrProgress > 0) && <div className="ocr-meter"><span style={{ width: `${ocrProgress}%` }} /><small>{ocrProgress}%</small></div>}
              {imageName && <div className="ocr-confidence-row"><span><small>Character confidence</small><strong>{ocrCharacterConfidence === null ? "Pending" : `${ocrCharacterConfidence}%`}</strong></span><span><small>Headline-selection confidence</small><strong>{manualSelection ? "User selected" : headlineSelectionConfidence === null ? "Pending" : `${headlineSelectionConfidence}%`}</strong></span></div>}
              {imageName && !ocrBusy && <button className={`confirm-ocr ${ocrConfirmed ? "confirmed" : ""}`} onClick={() => {
                const validation = validateHeadline(headline, headlineSelectionConfidence ?? 100, true);
                setHeadlinePlausible(validation.plausible);
                if (validation.plausible) {
                  setOcrConfirmed(true);
                  setErrorMessage("");
                  setOcrStatus("Headline confirmed. Ready to analyse.");
                  setPipelineStage("Ready");
                  setPipelineNote("OCR headline confirmed. Custom headline ready to analyse.");
                } else {
                  setOcrConfirmed(false);
                  setErrorMessage(validation.warning);
                  setOcrStatus(validation.warning);
                }
              }} disabled={!headline.trim() || !headlinePlausible}>{ocrConfirmed ? "✓ Headline confirmed" : "Confirm headline"}</button>}
            </div>
          </div>

          <div className="demo-strip" aria-label="Prepared demonstration cases">
            <span>Pre-verified demos</span>
            {demoCases.map((demo, index) => <button key={demo.id} onClick={() => selectDemo(demo)}><b>0{index + 1}</b>{index === 0 ? "RBI rate decision" : index === 1 ? "Red Sea shipping" : "AI energy demand"}</button>)}
          </div>

          <div className="run-row">
            <div className="pipeline-status"><span className={`status-dot ${pipelineStage === "Complete" ? "complete" : pipelineStage === "Fallback ready" ? "warning" : isAnalysing ? "working" : ""}`} /><p><strong>{pipelineStage}</strong><small>{pipelineNote}</small></p></div>
            <button className="analyse-button" onClick={runAnalysis} disabled={isAnalysing || ocrBusy || !headline.trim() || requiresOcrConfirmation}>{isAnalysing ? "Tracing evidence…" : "Analyse headline"}<span>↗</span></button>
          </div>
          {errorMessage && <div className="alert" role="alert"><strong>Action needed</strong><span>{errorMessage}</span><button onClick={() => setErrorMessage("")}>Dismiss</button></div>}
          {isAnalysing && <ol className="loading-stages" aria-label="Analysis progress">{stageOrder.map((stage) => <li key={stage} className={stage === pipelineStage ? "active" : stageOrder.indexOf(stage) < stageOrder.indexOf(pipelineStage) ? "done" : ""}><i />{stage}</li>)}</ol>}
        </div>
      </section>

      <section className="result-shell" id="analysis-result">
        <div className="result-heading">
          <span className="section-index">02 / ANALYSIS RESULT</span>
          <div className={`mode-badge ${hasCurrentResult ? result.mode : ""} ${resultStateClass}`}><i />{resultStateLabel}</div>
        </div>

        {!hasCurrentResult ? <article className="retrieval-failure content-panel pending-result">
          <div className="failure-kicker"><span>Analysis pending</span><small>Source language: {detectedInputLanguage}</small></div>
          <h2>{isAnalysing ? "Tracing evidence for this headline…" : "Your custom headline is ready to analyse."}</h2>
          <div className="failure-explanation"><strong>The previous result has been cleared.</strong><p>{isAnalysing ? "MacroLens is checking source eligibility, claim support and contradiction before it renders a result." : "Run analysis to create a new, clearly labelled result for this headline."}</p></div>
        </article> : retrievalUnavailable ? <article className="retrieval-failure content-panel">
          <div className="failure-kicker"><span>Retrieval unavailable</span><small>Source language: {result.detectedLanguage}</small></div>
          <h2 className={result.headline.length > 180 ? "very-long" : result.headline.length > 90 ? "long" : ""}>“{result.headline}”</h2>
          <div className="failure-explanation"><strong>No evidence-backed analysis was generated.</strong><p>The public source feeds returned zero usable results. MacroLens has not created a causal map, winners, losers or a Stress Test from unsupported commentary.</p></div>
          <div className="language-status"><span>Source language: <b>{result.detectedLanguage}</b></span><span>Explanation language: <b>{explanationLanguage}</b></span><span>Machine translation: <b>{result.detectedLanguage === explanationLanguage ? "not required" : "not human-verified"}</b></span></div>
          <div className="failure-actions"><button onClick={() => { setInputMode("text"); document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }); window.setTimeout(() => headlineInputRef.current?.focus(), 350); }}>Edit headline</button><button onClick={runAnalysis}>Retry retrieval</button></div>
          <div className="failure-demos"><span>Or select a prepared case</span>{demoCases.map((demo, index) => <button key={demo.id} onClick={() => selectDemo(demo)}><b>0{index + 1}</b>{index === 0 ? "RBI decision" : index === 1 ? "Red Sea" : "AI energy"}</button>)}</div>
          <div className="system-note"><span>System note</span><p>Retrieval failure is a capability boundary, not an economic conclusion.</p></div>
        </article> : <>
        <article className="original-headline content-panel">
          <div><span>01 · Original headline</span><small>Source language: {result.detectedLanguage} · {result.updated}</small></div>
          <h2 className={result.headline.length > 180 ? "very-long" : result.headline.length > 90 ? "long" : ""}>“{result.headline}”</h2>
          <div className="frame-row"><p>{translatedFrame || result.shortFrame}</p><div><label htmlFor="output-language">{labels[explanationLanguage].output}</label><select id="output-language" value={explanationLanguage} onChange={(event) => setExplanationLanguage(event.target.value as ExplanationLanguage)}><option>English</option><option>Hindi</option><option>Marathi</option></select><small>Explanation language: {explanationLanguage} · Machine translation: {result.detectedLanguage === explanationLanguage ? "not required" : "not human-verified"}</small></div></div>
        </article>

        <section className="ordered-section claims-section">
          <div className="section-title"><span>02</span><div><h3>Extracted claims</h3><p>Each statement receives its own evidence status.</p></div></div>
          <div className="claims-grid">{result.claims.map((claim) => <article className="claim-card" key={claim.id}><div><b>{claim.id}</b><span className="claim-category">{claim.category}</span><span className={`stamp ${kindClass(claim.kind)}`}>{claim.kind}</span></div><p>{claim.text}</p><footer>{claim.evidenceIds.length ? <span>Linked: {claim.evidenceIds.join(" · ")}</span> : <span className="missing">No supporting evidence linked</span>}</footer></article>)}</div>
        </section>

        <section className="ordered-section confirmation-grid">
          <article className="content-panel"><div className="section-title compact"><span>03</span><div><h3>What is confirmed</h3><p>Only statements supported by the current ledger.</p></div></div>{result.confirmed.length ? <><ul>{result.confirmed.map((item) => <li key={item}>{item}</li>)}</ul><small className="trace-note">Trace to confirmed claims and {confirmedEvidenceIds.join(" · ") || "the evidence ledger"}</small></> : <div className="insufficient-message">No claim met the confirmation threshold. Limited support, if any, remains labelled as an inference in the claim cards and evidence ledger.</div>}</article>
          <article className="content-panel uncertainty-panel"><div className="section-title compact"><span>04</span><div><h3>What remains uncertain</h3><p>Gaps are part of the answer.</p></div></div><ul>{result.uncertain.map((item) => <li key={item}>{item}</li>)}</ul></article>
        </section>

        {canRenderCausalSurface ? <>
        <section className="ordered-section map-section">
          <div className="section-title"><span>05</span><div><h3>Interactive causal map</h3><p>Select a node to inspect its evidence, reasoning and uncertainty.</p></div></div>
          <div className="map-workspace">
            <div className="causal-map" aria-label="Signal to mechanism to relevance causal map">
              <div className="map-axis"><span>Signal</span><span>Mechanism</span><span>Relevance</span></div>
              <div className="map-track" />
              <div className="map-arrows" aria-hidden="true"><span>→</span><span>→</span><span>→</span><span>→</span></div>
              {result.nodes.map((node, index) => <button key={node.id} className={`map-node node-${index + 1} ${selectedNodeId === node.id ? "active" : ""}`} onClick={() => selectNode(node)} aria-pressed={selectedNodeId === node.id}><small>{String(index + 1).padStart(2, "0")} · {node.layer}</small><strong>{node.title}</strong><span className={`stamp ${kindClass(node.kind)}`}>{node.kind}</span></button>)}
            </div>

            <aside className="evidence-inspector glass" aria-live="polite">
              <div className="inspector-head"><span>Evidence inspector</span><b className={`confidence-chip ${selectedNode.confidence.toLowerCase()}`}>{selectedNode.confidence} confidence</b></div>
              <p className="node-layer">{selectedNode.layer}</p><h4>{selectedNode.title}</h4><p>{selectedNode.summary}</p>
              <div className="reasoning-block"><span>Uncertainty</span><p>{selectedNode.uncertainty}</p></div>
              <div className="linked-evidence"><span>Evidence behind this node</span>{linkedSources.length ? linkedSources.map((source) => <button key={source.id} className={selectedSourceId === source.id ? "active" : ""} onClick={() => setSelectedSourceId(source.id)}><b>{source.id}</b><span>{source.publisher}</span><small>{source.evidenceRole}</small></button>) : <div className="empty-evidence">No source directly verifies this node.</div>}</div>
              {selectedSource && selectedNode.evidenceIds.includes(selectedSource.id) && <a className="source-preview" href={selectedSource.url} target="_blank" rel="noopener noreferrer"><span>{selectedSource.title}</span><small>Open source ↗</small></a>}
            </aside>
          </div>
        </section>

        <section className="ordered-section relevance-section">
          <div className="section-title"><span>06</span><div><h3>Why it matters</h3><p>India, youth and real-world decision relevance.</p></div></div>
          <div className="relevance-list">{result.whyItMatters.map((item, index) => { const evidenceLinked = result.mode === "curated" && Boolean(relevanceNode?.evidenceIds.length); const liveHypothesis = result.mode === "live"; return <article key={item}><div><b>0{index + 1}</b><span className={`stamp ${evidenceLinked ? "inference" : liveHypothesis ? "hypothesis" : "system"}`}>{evidenceLinked ? "Evidence-supported inference" : liveHypothesis ? "Causal hypothesis" : "System note"}</span></div><p>{item}</p><small>{evidenceLinked ? `Trace to ${relevanceNode?.evidenceIds.join(" · ")}` : liveHypothesis ? "Economic pathway · requires direct evidence" : "Product guidance · not an evidence claim"}</small></article>; })}</div>
        </section>

        <section className="ordered-section impact-section">
          <div className="section-title"><span>07</span><div><h3>Quiet winners and losers</h3><p>Potential exposure—not a prediction.</p></div></div>
          <div className="impact-grid"><article className="winner-panel content-panel"><div className="impact-label"><span>Quiet winners</span><span className="stamp hypothesis">Potential exposure</span></div>{result.winners.map((item) => <p key={item}>↗ {item}</p>)}</article><article className="loser-panel content-panel"><div className="impact-label"><span>Quiet losers</span><span className="stamp hypothesis">Potential exposure</span></div>{result.losers.map((item) => <p key={item}>↘ {item}</p>)}</article></div>
        </section>

        <section className="ordered-section stress-section content-panel">
          <div className="section-title"><span>08</span><div><h3>Stress Test</h3><p>What could weaken, reverse or complicate the main explanation?</p></div></div>
          <div className="stress-grid"><article><span>Challenging evidence</span>{result.stressTest.challengingEvidence.map((item) => <p key={item}>{item}</p>)}</article><article><span>Alternative explanations</span>{result.stressTest.alternatives.map((item) => <p key={item}>{item}</p>)}</article><article><span>Missing information</span>{result.stressTest.missingInformation.map((item) => <p key={item}>{item}</p>)}</article><article><span>What changes the conclusion</span>{result.stressTest.changeConditions.map((item) => <p key={item}>{item}</p>)}</article></div>
          <div className="stress-sources"><span>Counter/context trail</span>{stressSources.length ? stressSources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer"><b>{source.id}</b>{source.evidenceRole}</a>) : <small>No article-level counter-evidence retrieved.</small>}</div>
        </section>
        </> : <section className="ordered-section causal-boundary content-panel">
          <div className="section-title"><span>05–08</span><div><h3>No evidence-backed economic pathway</h3><p>No generic mechanism, relevance, winners or losers were generated.</p></div></div>
          <div className="causal-boundary-copy"><strong>The retrieved evidence did not establish a reliable business or economic channel.</strong><p>MacroLens still shows the claim and evidence ledger, but does not invent an economic story from weak, unrelated or contradictory sources.</p></div>
        </section>}

        <section className="ordered-section confidence-section content-panel">
          <div className="section-title"><span>09</span><div><h3>Confidence explanation</h3><p>No unsupported percentage. The category reflects evidence quality and completeness.</p></div></div>
          <div className="confidence-layout"><div className={`confidence-orb ${result.confidence.level.toLowerCase()}`}><strong>{result.confidence.level}</strong><span>confidence</span></div><ul>{result.confidence.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
        </section>

        <section className="ordered-section ledger-section">
          <div className="section-title"><span>10</span><div><h3>Evidence ledger</h3><p>Every source has a type, claim link, role and concise evidence note.</p></div></div>
          {result.sources.length ? <div className="ledger-wrap"><table><thead><tr><th>Source</th><th>Publisher / date</th><th>Type</th><th>Claim</th><th>Evidence role</th><th>Relevant evidence</th></tr></thead><tbody>{result.sources.map((source) => <tr key={source.id} id={`evidence-${source.id}`}><td><a href={source.url} target="_blank" rel="noopener noreferrer"><b>{source.id}</b>{source.title}<span>Open ↗</span></a></td><td>{source.publisher}<small>{source.date}</small></td><td>{source.sourceType}</td><td>{source.relatedClaims.length ? source.relatedClaims.join(", ") : "None"}</td><td><span className={`role-pill ${roleClass(source.evidenceRole)}`}>{source.evidenceRole}</span></td><td>{source.note}</td></tr>)}</tbody></table></div> : <div className="ledger-empty content-panel"><strong>No evidence ledger available</strong><p>There is currently insufficient reliable evidence to verify this claim. Retry live retrieval or load a pre-verified demo.</p><button onClick={runAnalysis}>Retry retrieval</button></div>}
        </section>

        <section className="ordered-section limitations-section content-panel">
          <div className="section-title"><span>11</span><div><h3>Limitations</h3><p>What this result cannot establish.</p></div></div><ul>{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        </>}
      </section>

      <section className="method-shell" id="method">
        <div className="method-heading"><span className="section-index">03 / METHOD &amp; TRANSPARENCY</span><h2>AI assists judgement. It does not replace it.</h2><p>The competition build exposes its retrieval depth, evidence role and uncertainty at every important step.</p></div>
        <div className="method-grid">
          <article><span>01</span><h3>Scope and claim extraction</h3><p>Any custom headline is accepted. Claim extraction preserves the headline; retrieval adds a business-and-economics lens. Curated cases use reviewed claim sets.</p></article>
          <article><span>02</span><h3>Retrieval</h3><p>MacroLens checks read source text for direct support, explicit contradiction and hedging. Unrated websites stay context; METADATA ONLY RETRIEVED means titles or snippets were available and cannot raise confidence.</p></article>
          <article><span>03</span><h3>AI usage</h3><p>Tesseract.js first detects layout with sparse-text segmentation, then rereads only the selected region. Character confidence and headline-selection confidence remain separate.</p></article>
          <article><span>04</span><h3>Privacy</h3><p>Uploaded images are processed in the browser, shown via a temporary object URL and not sent to the MacroLens server.</p></article>
          <article><span>05</span><h3>Confidence</h3><p>High requires complete factual-claim coverage from eligible source text, no eligible contradiction and no unresolved causal claim. Counts alone cannot make confidence High.</p></article>
          <article><span>06</span><h3>Capability boundary</h3><p>Every headline is accepted, but MacroLens reports only evidence-linked business and economic pathways. If none is supported, it says so. Metadata is not claim verification.</p></article>
        </div>
        <div className="resource-disclosure"><strong>Audited resource disclosure</strong><span>Next.js · React · TypeScript · Tesseract.js · Tavily · GDELT DOC 2.0 · Google News RSS · Sora, Inter and Noto Sans Devanagari (OFL)</span><small>Tavily is an optional server-side API integration for public-source retrieval. Re-audit usage, pricing and disclosures after any provider change.</small></div>
      </section>

      <footer className="site-footer"><div><span className="brand-mark">ML</span><p><strong>MacroLens</strong><small>See beyond the story. Understand the system.</small></p></div><span>HKU AI+ Challenge · Competition build under review · August 2026</span></footer>
    </main>
  );
}
