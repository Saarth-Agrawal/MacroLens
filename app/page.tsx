"use client";
import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import ResultExperience from "./components/ResultExperience";
import MacroLensChat from "./components/MacroLensChat";
import { demoCases, findDemoCase, type AnalysisResult, type UserProfile } from "./data/demoCases";
import { buildLiveAnalysis, detectLanguage, type PlannedClaim, type RetrievedArticle } from "./lib/analysis";
import { applyGeminiAnalysis } from "./lib/geminiAnalysis";
import { userProfiles } from "./lib/resultExperience";
import { cropCanvas, prepareDocumentImage } from "./lib/documentImage";
import { bodyTextWarning, buildHeadlineCandidates, chooseVisualConfusableAlternative, cleanOcrText, mergeLayoutAndDetail, validateHeadline, type CropRegion, type HeadlineCandidate, type OcrLineBox } from "./lib/headlineOcr";

type ExplanationLanguage = "English" | "Hindi" | "Marathi";
type InputMode = "text" | "lens";
type PipelineStage = "Ready" | "Reading image" | "Decomposing claims" | "Retrieving evidence" | "Linking evidence" | "Complete" | "Fallback ready" | "Analysis unavailable";
type CropDrag = { mode: "new" | "move" | "resize"; startX: number; startY: number; start: CropRegion; corner?: "nw" | "ne" | "sw" | "se" };

const stageOrder: PipelineStage[] = ["Decomposing claims", "Retrieving evidence", "Linking evidence", "Complete"];
const fullPageCrop: CropRegion = { left: 0, top: 0, width: 100, height: 100 };

function analysisInputKey(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function ScanPreview({ src }: { src: string }) {
  // A temporary browser blob URL cannot be routed through the hosted image optimiser.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="scan-preview" src={src} alt="Newspaper scan preview" />;
}

export default function Home() {
  const [headline, setHeadline] = useState(demoCases[0].headline);
  const [result, setResult] = useState<AnalysisResult>(demoCases[0]);
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [explanationLanguage, setExplanationLanguage] = useState<ExplanationLanguage>("English");
  const [ocrLanguage, setOcrLanguage] = useState<ExplanationLanguage>("English");
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
  const [shareStatus, setShareStatus] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<UserProfile>("General reader");
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
  const analysisRunRef = useRef(0);
  const activeRetrievalControllerRef = useRef<AbortController | null>(null);

  const detectedInputLanguage = useMemo(() => detectLanguage(headline), [headline]);
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

  useEffect(() => () => {
    analysisRunRef.current += 1;
    activeRetrievalControllerRef.current?.abort();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  // Elements tagged with the "reveal" class fade and lift into place the
  // first time they cross the viewport, instead of the whole result
  // rendering flat and static. Re-runs whenever new "reveal" targets can
  // enter the DOM (a fresh result, or a toggle opening previously hidden
  // sections) so newly mounted content gets observed too.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -60px 0px" });
    document.querySelectorAll(".reveal:not(.is-visible)").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [hasCurrentResult]);

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
      const payload = await response.json() as { articles?: RetrievedArticle[]; provider?: string; limitation?: string; diagnostics?: Record<string, string>; researchPlan?: { framing?: string; claims?: PlannedClaim[]; queries?: string[] } };
      if (!response.ok) throw new Error(payload.limitation || `Research returned ${response.status}`);
      if (payload.articles?.length && payload.researchPlan?.claims?.length) return { articles: payload.articles, provider: payload.provider || "Gemini-planned Tavily research", limitation: payload.limitation, researchPlan: payload.researchPlan };
      const diagnosticText = payload.diagnostics ? Object.entries(payload.diagnostics).map(([provider, status]) => `${provider}: ${status}`).join(" · ") : "provider diagnostics unavailable";
      throw new Error(`${payload.limitation || "Gemini-planned Tavily research did not return usable evidence."} ${diagnosticText}`);
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
    setPipelineNote("Gemini is separating the headline into researchable claims and planning targeted Tavily searches…");

    if (demo) {
      await sleep(420);
      if (analysisRunRef.current !== runId) return;
      setPipelineStage("Linking evidence");
      setPipelineNote("Loading the fixed, dated source ledger for this curated case…");
      await sleep(420);
      if (analysisRunRef.current !== runId) return;
      setResult(demo);
      setResultIsFresh(true);
      setPipelineStage("Complete");
      setPipelineNote("Curated demo case loaded. It is pre-verified and is not represented as live retrieval.");
      setIsAnalysing(false);
      document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    try {
      setPipelineStage("Retrieving evidence");
      setPipelineNote("Gemini is planning targeted evidence queries; Tavily will retrieve the resulting public sources…");
      const retrievalController = new AbortController();
      const retrieval = await retrieveArticles(cleanHeadline, retrievalController);
      if (analysisRunRef.current !== runId) return;
      setPipelineStage("Linking evidence");
      setPipelineNote("Checking source eligibility, support, contradiction and evidence gaps…");
      let liveResult = buildLiveAnalysis(cleanHeadline, retrieval.articles, retrieval.researchPlan.claims);
      if (!liveResult.sources.length) throw new Error(retrieval.limitation || "No public sources were retrieved for analysis.");
      setPipelineNote("Gemini 3.5 Flash-Lite is generating the complete result and five structured Council perspectives…");
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: retrievalController.signal,
        body: JSON.stringify({ headline: cleanHeadline, language: liveResult.detectedLanguage, profile: selectedProfile, claims: liveResult.claims, sources: liveResult.sources }),
      });
      const payload = await response.json() as { available?: boolean; analysis?: NonNullable<AnalysisResult["aiAnalysis"]>; reason?: string };
      if (analysisRunRef.current !== runId) return;
      if (!response.ok || !payload.available || !payload.analysis) throw new Error(payload.reason || "Gemini returned an incomplete analysis.");
      liveResult = applyGeminiAnalysis(liveResult, payload.analysis);
      if (!liveResult.aiAnalysis) throw new Error("Gemini returned an incomplete analysis structure.");
      setResult(liveResult);
      setResultIsFresh(true);
      setPipelineStage(retrieval.articles.length ? "Complete" : "Fallback ready");
      setPipelineNote(retrieval.articles.length
        ? `LIVE ANALYSIS · ${retrieval.provider}: ${retrieval.articles.length} source${retrieval.articles.length === 1 ? "" : "s"} retrieved from ${retrieval.researchPlan.queries?.length || 0} Gemini-planned Tavily queries. Gemini 3.5 Flash-Lite then generated the complete result and five-role Council analysis.`
        : retrieval.limitation || "No close public evidence was retrieved. The insufficient-evidence safeguard is active.");
    } catch (error) {
      if (analysisRunRef.current !== runId) return;
      setResultIsFresh(false);
      setPipelineStage("Analysis unavailable");
      const message = error instanceof Error ? error.message : "The complete Gemini analysis could not be generated.";
      setPipelineNote(message);
      setErrorMessage(`${message} Try again or use a curated demonstration.`);
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

  const shareResult = async () => {
    const frame = explanationLanguage === "English" ? result.bottomLine.explanation : result.translatedFrame?.[explanationLanguage] ?? result.bottomLine.explanation;
    const count = result.bottomLine.independentSourceCount;
    const text = `MacroLens\n"${result.headline}"\n\n${frame}\n\n${result.bottomLine.evidenceStatus} · ${count} independent usable source organisation${count === 1 ? "" : "s"}`;
    try {
      const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ title: "MacroLens analysis", text });
        return;
      }
      throw new Error("share unavailable");
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus("Copied to clipboard");
      } catch {
        setShareStatus("Couldn't share — copy the summary manually");
      }
      window.setTimeout(() => setShareStatus(""), 2600);
    }
  };

  return (
    <main id="top">
      <header className="site-nav glass">
        <a className="brand" href="#top" aria-label="MacroLens home">
          <span className="brand-mark" aria-hidden="true">ML</span>
          <span><strong>MacroLens</strong><small>Evidence-linked media intelligence</small></span>
        </a>
        <button className="mobile-nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded={mobileNavOpen} aria-controls="primary-navigation" onClick={() => setMobileNavOpen((open) => !open)}>Menu</button>
        <nav id="primary-navigation" className={mobileNavOpen ? "open" : ""} aria-label="Primary navigation"><a href="#workspace" onClick={() => setMobileNavOpen(false)}>Analyse</a><a href="#method" onClick={() => setMobileNavOpen(false)}>How it works</a></nav>
        <span className="competition-chip"><i /> Competition MVP</span>
      </header>

      <section className="intro-shell">
        <div className="intro-copy">
          <p className="eyebrow">EVIDENCE-LINKED ECONOMIC INTELLIGENCE</p>
          <h1>What&rsquo;s really happening <span>behind the headline?</span></h1>
          <p>Paste a headline, article, or screenshot. We&rsquo;ll show you what&rsquo;s true, what it means, and what could happen next.</p>
          <div className="hero-actions">
            <button className="live-lens-button" onClick={() => { resetInput(); setInputMode("text"); window.setTimeout(() => headlineInputRef.current?.focus(), 300); window.setTimeout(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20); }}>Analyse a headline <span>↗</span></button>
            <div className="hero-demos"><span>Or try an example</span>{demoCases.map((demo, index) => <button key={demo.id} onClick={() => { selectDemo(demo); window.setTimeout(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20); }}>0{index + 1}</button>)}</div>
          </div>
        </div>
        <div className="hero-spatial" aria-label="MacroLens turns a headline into evidence, economic mechanisms and real-world relevance">
          <div className="orbit orbit-one" aria-hidden="true" />
          <div className="orbit orbit-two" aria-hidden="true" />
          <div className="spatial-card spatial-headline"><span>HEADLINE</span><strong>RBI keeps rates unchanged</strong><small>Input signal</small></div>
          <div className="spatial-card spatial-evidence"><span>WHAT&rsquo;S TRUE?</span><strong>Rate decision confirmed</strong><small><i /> Primary source linked</small></div>
          <div className="spatial-card spatial-impact"><span>WHY IT MATTERS</span><strong>Credit transmission</strong><small>Households · Business · India</small></div>
          <div className="spatial-core" aria-hidden="true"><span>ML</span><i /></div>
          <div className="spatial-caption"><span>01</span><p><b>One headline.</b><small>A complete evidence trail beneath it.</small></p></div>
        </div>
      </section>

      <div className="trust-strip" aria-label="MacroLens reliability protocol">
        <div><span>01</span><p><b>Claims first</b><small>Checkable statements</small></p></div>
        <div><span>02</span><p><b>Evidence linked</b><small>Sources at every step</small></p></div>
        <div><span>03</span><p><b>Uncertainty visible</b><small>No false certainty</small></p></div>
        <div><span>04</span><p><b>Economic lens</b><small>Impact without invention</small></p></div>
      </div>

      <section className="workspace-shell" id="workspace">
        <div className="workspace-heading">
          <div><span className="section-index">START HERE</span><h2>Give us a headline. We&rsquo;ll explain it.</h2></div>
          <p>Any topic works — MacroLens looks for its evidence-linked business and economic story underneath.</p>
        </div>

        <div className="input-dock glass reveal">
          <div className="input-tabs" role="tablist" aria-label="Headline input method">
            <button className={inputMode === "text" ? "active" : ""} onClick={() => setInputMode("text")} role="tab" aria-selected={inputMode === "text"}>Paste</button>
            <button className={inputMode === "lens" ? "active" : ""} onClick={() => setInputMode("lens")} role="tab" aria-selected={inputMode === "lens"}>📷 Scan</button>
          </div>

          <div className={`input-layout ${inputMode === "lens" ? "lens-active" : ""}`}>
            <div className="headline-field">
              <div className="field-label"><label htmlFor="headline">Headline, article or claim</label><span>Source language: {detectedInputLanguage}</span></div>
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
              }} placeholder="Paste a headline or article…" maxLength={500} aria-describedby="headline-scope headline-count" />
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
            <span>Try an example</span>
            {demoCases.map((demo, index) => <button key={demo.id} onClick={() => selectDemo(demo)}><b>0{index + 1}</b>{index === 0 ? "RBI rate decision" : index === 1 ? "Red Sea shipping" : "AI energy demand"}</button>)}
          </div>

          <div className="run-row">
            <div className="pipeline-status"><span className={`status-dot ${pipelineStage === "Complete" ? "complete" : pipelineStage === "Fallback ready" ? "warning" : isAnalysing ? "working" : ""}`} /><p><strong>{pipelineStage}</strong><small>{pipelineNote}</small></p></div>
            <label className="analysis-profile-control" htmlFor="analysis-profile"><span>Explain relevance for</span><select id="analysis-profile" value={selectedProfile} onChange={(event) => setSelectedProfile(event.target.value as UserProfile)}>{userProfiles.map((profile) => <option key={profile}>{profile}</option>)}</select></label>
            <button className={`analyse-button ${isAnalysing ? "working" : ""}`} onClick={runAnalysis} disabled={isAnalysing || ocrBusy || !headline.trim() || requiresOcrConfirmation}>{isAnalysing ? "Tracing evidence…" : "Analyse"}<span>↗</span></button>
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
        </article> : <ResultExperience
          key={result.id}
          result={result}
          explanationLanguage={explanationLanguage}
          onExplanationLanguageChange={setExplanationLanguage}
          onShare={shareResult}
          shareStatus={shareStatus}
          profile={selectedProfile}
          onProfileChange={setSelectedProfile}
        />}
      </section>

      <section className="method-shell" id="method">
        <div className="method-heading reveal"><span className="section-index">03 / METHOD &amp; TRANSPARENCY</span><h2>AI assists judgement. It does not replace it.</h2><p>The competition build exposes its retrieval depth, evidence role and uncertainty at every important step.</p></div>
        <div className="method-grid reveal">
          <article><span>01</span><h3>Scope and research planning</h3><p>For each custom headline, Gemini extracts independently researchable claims and plans targeted searches for primary evidence, independent reporting, mechanisms, consequences and counter-evidence. Curated cases use reviewed claim sets.</p></article>
          <article><span>02</span><h3>Retrieval</h3><p>Tavily executes the Gemini-planned queries and returns deduplicated public sources and readable excerpts. The second Gemini call assesses each source against each planned claim; metadata-only material remains explicitly identified.</p></article>
          <article><span>03</span><h3>AI usage</h3><p>Tesseract.js reads selected headline regions. For custom headlines, Gemini 3.5 Flash-Lite generates the complete structured result in one call: claim and source assessments, Bottom Line, story, profile relevance, causal map, confidence, stress test and five Council perspectives. Source and claim IDs are validated before rendering.</p></article>
          <article><span>04</span><h3>Privacy</h3><p>Uploaded images are processed in the browser, shown via a temporary object URL and not sent to the MacroLens server.</p></article>
          <article><span>05</span><h3>Confidence</h3><p>High requires complete factual-claim coverage from eligible source text, no eligible contradiction and no unresolved causal claim. Counts alone cannot make confidence High.</p></article>
          <article><span>06</span><h3>Capability boundary</h3><p>Every headline is accepted, but MacroLens reports only evidence-linked business and economic pathways. If none is supported, it says so. Metadata is not claim verification.</p></article>
        </div>
        <div className="resource-disclosure"><strong>Audited resource disclosure</strong><span>Next.js · React · TypeScript · Tesseract.js · Tavily · Gemini 3.5 Flash-Lite · Sora, Inter and Noto Sans Devanagari (OFL)</span><small>Gemini first plans claims and targeted Tavily queries, then a second structured Gemini call generates every custom analytical field, including five Council roles that are perspectives from one model rather than independent agents.</small></div>
      </section>

      <footer className="site-footer"><div><span className="brand-mark">ML</span><p><strong>MacroLens</strong><small>See beyond the story. Understand the system.</small></p></div><span>HKU AI+ Challenge · Competition build under review · August 2026</span></footer>
      <MacroLensChat headline={headline} result={hasCurrentResult ? result : null} />
    </main>
  );
}
