"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  type AnalysisResult,
  type Claim,
  type CausalNode,
  type EvidenceSource,
  type UserProfile,
  withUserProfile,
} from "../data/demoCases";
import { explanationPresentation, sourceInspectorModel, userProfiles } from "../lib/resultExperience";

type ExplanationLanguage = "English" | "Hindi" | "Marathi";
type InspectorTarget = { kind: "source" | "claim" | "node"; id: string };

type Props = {
  result: AnalysisResult;
  explanationLanguage: ExplanationLanguage;
  onExplanationLanguageChange: (language: ExplanationLanguage) => void;
  onShare: () => void;
  shareStatus: string;
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
};

const stageNodeLayers = ["Signal", "Mechanism", "Wider consequence", "Relevance"] as const;

function kindClass(kind: string) {
  if (kind === "Confirmed fact") return "confirmed";
  if (kind === "Evidence-supported inference") return "inference";
  if (kind === "Causal hypothesis" || kind === "Conditional" || kind === "Indirect" || kind === "Direct") return "hypothesis";
  return "unverified";
}

function roleClass(role: EvidenceSource["evidenceRole"]) {
  if (role === "Supports") return "supports";
  if (role === "Contradicts") return "contradicts";
  if (role === "Adds context") return "context";
  return "insufficient";
}

function evidenceLabel(count: number) {
  return `${count} independent usable source organisation${count === 1 ? "" : "s"}`;
}

function EvidenceButtons({ ids, onOpen, empty = "No direct source link" }: { ids: string[]; onOpen: (target: InspectorTarget) => void; empty?: string }) {
  if (!ids.length) return <span className="ml-no-evidence">{empty}</span>;
  return <span className="ml-evidence-buttons" aria-label="Linked evidence">{ids.map((id) => <button key={id} type="button" onClick={() => onOpen({ kind: "source", id })}>{id}</button>)}</span>;
}

function SourceList({ sources, onOpen }: { sources: EvidenceSource[]; onOpen: (target: InspectorTarget) => void }) {
  if (!sources.length) return <p className="ml-empty-state">No source text is available for inspection.</p>;
  return <div className="ml-source-list">{sources.map((source) => <button key={source.id} type="button" onClick={() => onOpen({ kind: "source", id: source.id })}>
    <span className="ml-source-id">{source.id}</span>
    <span><strong>{source.title}</strong><small>{source.publisher} · {source.date}</small></span>
    <span className={`ml-role-pill ${roleClass(source.evidenceRole)}`}>{source.evidenceRole}</span>
    <i aria-hidden="true">↗</i>
  </button>)}</div>;
}

export default function ResultExperience({ result, explanationLanguage, onExplanationLanguageChange, onShare, shareStatus, profile, onProfileChange }: Props) {
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const displayResult = useMemo(() => withUserProfile(result, profile), [profile, result]);
  const { bottomLine, visualStory, councilSynthesis } = displayResult;

  useEffect(() => {
    if (!inspectorTarget) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInspectorTarget(null);
        window.setTimeout(() => returnFocusRef.current?.focus(), 0);
        return;
      }
      if (event.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>(".ml-inspector");
        const focusable = dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')] : [];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inspectorTarget]);

  const openInspector = (target: InspectorTarget) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInspectorTarget(target);
  };

  const closeInspector = () => {
    setInspectorTarget(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };

  const explanation = explanationPresentation(displayResult, explanationLanguage);
  const stageNodes = stageNodeLayers.map((layer) => displayResult.nodes.find((node) => node.layer === layer));
  const storyStages = [
    {
      number: "01",
      label: "What happened",
      text: visualStory.whatHappened.text,
      status: visualStory.whatHappened.status,
      evidenceIds: visualStory.whatHappened.evidenceIds,
      node: stageNodes[0],
      context: [`Evidence updated: ${bottomLine.lastUpdated}`],
    },
    {
      number: "02",
      label: "Why",
      text: visualStory.why.text,
      status: visualStory.why.supportType,
      evidenceIds: visualStory.why.evidenceIds,
      node: stageNodes[1],
      context: [`Conditions: ${visualStory.why.conditions}`],
    },
    {
      number: "03",
      label: "What next",
      text: visualStory.whatNext.text,
      status: "Conditional" as const,
      evidenceIds: visualStory.whatNext.evidenceIds,
      node: stageNodes[2],
      context: [
        `Time horizon: ${visualStory.whatNext.timeHorizon}`,
        visualStory.whatNext.indicators.length ? `Watch: ${visualStory.whatNext.indicators.join(" · ")}` : "Watch: more direct evidence",
        `Uncertainty: ${visualStory.whatNext.uncertainty}`,
      ],
    },
    {
      number: "04",
      label: "Why you care",
      text: visualStory.whyYouCare.text,
      status: visualStory.whyYouCare.exposureType,
      evidenceIds: visualStory.whyYouCare.evidenceIds,
      node: stageNodes[3],
      context: [
        `Profile: ${visualStory.whyYouCare.userProfile} · ${visualStory.whyYouCare.exposureType}`,
        `Time horizon: ${visualStory.whyYouCare.timeHorizon}`,
        `Conditions: ${visualStory.whyYouCare.conditions}`,
      ],
    },
  ];

  return <div className="ml-result-experience">
    <article className="ml-result-brief" aria-labelledby="result-headline">
      <header className="ml-result-brief-head">
        <div><span>ANALYSIS RESULT</span><small>Source language: {displayResult.detectedLanguage} · {displayResult.updated}</small></div>
        <button type="button" className="ml-share-button" onClick={onShare}>Share <span aria-hidden="true">↗</span>{shareStatus && <small>{shareStatus}</small>}</button>
      </header>

      <h2 id="result-headline" className={displayResult.headline.length > 120 ? "long" : ""}>“{displayResult.headline}”</h2>

      <section className="ml-bottom-line" aria-label="The Bottom Line">
        <div className="ml-bottom-line-heading">
          <div><span>THE BOTTOM LINE</span><small>Auditor-checked summary</small></div>
          <span className={`ml-status-chip ${bottomLine.evidenceStatus.toLocaleLowerCase()}`}>{bottomLine.evidenceStatus}</span>
        </div>
        <p className="ml-bottom-line-copy">{explanation.text}</p>
        <div className="ml-bottom-meta">
          <span><b>{evidenceLabel(bottomLine.independentSourceCount)}</b><small>Duplicates and unrated pages excluded</small></span>
          <span><b>{bottomLine.lastUpdated}</b><small>Last evidence update</small></span>
        </div>
        <div className="ml-bottom-details">
          <div><span>Key implication</span><p>{bottomLine.keyImplication}</p></div>
          <div><span>Key uncertainty</span><p>{bottomLine.keyUncertainty}</p></div>
        </div>
        <div className="ml-language-control">
          <label htmlFor={`result-language-${displayResult.id}`}>Explanation language</label>
          <select id={`result-language-${displayResult.id}`} value={explanationLanguage} onChange={(event) => onExplanationLanguageChange(event.target.value as ExplanationLanguage)}>
            <option>English</option><option>Hindi</option><option>Marathi</option>
          </select>
          <small>{explanation.disclosure}</small>
        </div>
      </section>

      <div className="ml-story-heading">
        <div><span>THE STORY</span><h3>From evidence to relevance</h3></div>
        <label>Show relevance for
          <select value={profile} onChange={(event) => onProfileChange(event.target.value as UserProfile)}>
            {userProfiles.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <ol className="ml-story-path" aria-label="Four-stage evidence story">
        {storyStages.map((stage) => <li key={stage.number}>
          <div className="ml-story-marker"><span>{stage.number}</span><i /></div>
          <article>
            <header><span>{stage.label}</span><span className={`ml-inference-label ${kindClass(stage.status)}`}>{stage.status}</span></header>
            <p>{stage.text}</p>
            {stage.context?.length ? <ul className="ml-story-context">{stage.context.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            <footer>
              <EvidenceButtons ids={stage.evidenceIds} onOpen={openInspector} />
              {stage.node && <button type="button" className="ml-inspect-link" onClick={() => openInspector({ kind: "node", id: stage.node!.id })}>Inspect reasoning →</button>}
            </footer>
          </article>
        </li>)}
      </ol>

      <aside className="ml-key-uncertainty">
        <span>KEY UNCERTAINTY</span>
        <p>{bottomLine.keyUncertainty}</p>
      </aside>

      <div className="ml-result-actions">
        <button type="button" className="primary" aria-expanded={deepDiveOpen} onClick={() => setDeepDiveOpen((open) => !open)}>{deepDiveOpen ? "CLOSE DEEP DIVE" : "DIVE DEEPER"}<span aria-hidden="true">{deepDiveOpen ? "↑" : "↓"}</span></button>
        <button type="button" className="secondary" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((open) => !open)}>{sourcesOpen ? "HIDE SOURCES" : "VIEW SOURCES"}<span aria-hidden="true">↗</span></button>
      </div>

      {sourcesOpen && <section className="ml-quick-sources" aria-label="Sources">
        <div className="ml-subsection-head"><div><span>LEVEL 3</span><h3>Inspect the source trail</h3></div><p>Open an item to see its tier, excerpt, claim links, evidence role and limitations.</p></div>
        <SourceList sources={displayResult.sources} onOpen={openInspector} />
      </section>}
    </article>

    {deepDiveOpen && <section className="ml-deep-dive" aria-label="Deep Dive">
      <header className="ml-deep-dive-head"><span>LEVEL 2 · DIVE DEEPER</span><h2>How the conclusion was challenged</h2><p>Five independent roles inspect different failure modes. This is a structured debate, not a vote, and agreement is not proof.</p></header>

      <section className="ml-council-section" aria-labelledby="council-title">
        <div className="ml-subsection-head"><div><span>01</span><h3 id="council-title">Evidence Council</h3></div><p>Each role has its own purpose, evidence trail, uncertainty and challenge.</p></div>
        {displayResult.councilPerspectives.length ? <div className="ml-council-grid">{displayResult.councilPerspectives.map((perspective, index) => <details key={perspective.role} open={index === 0}>
          <summary><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{perspective.role}</strong><small>{perspective.purpose}</small></div><i aria-hidden="true">+</i></summary>
          <div className="ml-council-body">
            <div><span>Position</span><p>{perspective.position}</p></div>
            <div><span>Reasoning</span><p>{perspective.reasoning}</p></div>
            <div><span>Uncertainty</span><p>{perspective.uncertainty}</p></div>
            <div><span>Challenge</span><p>{perspective.challenges}</p></div>
            <div className="ml-council-trace"><span>Evidence</span><EvidenceButtons ids={perspective.evidenceIds} onOpen={openInspector} /><span>Claims</span><span className="ml-evidence-buttons">{perspective.claimIds.map((id) => <button key={id} type="button" onClick={() => openInspector({ kind: "claim", id })}>{id}</button>)}</span></div>
            <blockquote>{perspective.questionForUser}</blockquote>
            <small className="ml-confidence-category">Calibrated category: {perspective.confidenceCategory}</small>
          </div>
        </details>)}</div> : <div className="ml-evidence-boundary"><strong>No artificial Council debate was generated.</strong><p>Without usable evidence, five personas would only repeat speculation. The result instead states what evidence is needed.</p></div>}
      </section>

      <section className="ml-synthesis-section" aria-labelledby="synthesis-title">
        <div className="ml-subsection-head"><div><span>02</span><h3 id="synthesis-title">Council synthesis</h3></div><p>Agreement, disagreement and unresolved questions remain separate.</p></div>
        <div className="ml-synthesis-grid">
          <article><span>Areas of agreement</span>{councilSynthesis.areasOfAgreement.length ? <ul>{councilSynthesis.areasOfAgreement.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No evidence-backed agreement can be recorded.</p>}</article>
          <article><span>Unresolved questions</span><ul>{councilSynthesis.unresolvedQuestions.map((item) => <li key={item}>{item}</li>)}</ul></article>
          <article><span>Evidence still needed</span><ul>{councilSynthesis.evidenceNeeded.map((item) => <li key={item}>{item}</li>)}</ul></article>
        </div>
        {councilSynthesis.areasOfDisagreement.length > 0 && <div className="ml-disagreements"><span>Named disagreements</span>{councilSynthesis.areasOfDisagreement.map((item) => <article key={`${item.roles.join("-")}-${item.subject}`}><div><b>{item.roles[0]}</b><i aria-hidden="true">↔</i><b>{item.roles[1]}</b><small>{item.concern}</small></div><p>{item.subject}</p><div className="ml-disagreement-evidence">{item.roles.map((role) => <span key={role}><small>{role}</small><EvidenceButtons ids={item.evidenceByRole[role] ?? []} onOpen={openInspector} /></span>)}</div></article>)}</div>}
      </section>

      <section className="ml-claims-section" aria-labelledby="claims-title">
        <div className="ml-subsection-head"><div><span>03</span><h3 id="claims-title">Claims and causal detail</h3></div><p>Inspect any statement or pathway node at full traceability depth.</p></div>
        <div className="ml-claims-layout">
          <div className="ml-claim-list">{displayResult.claims.map((claim) => <button key={claim.id} type="button" onClick={() => openInspector({ kind: "claim", id: claim.id })}><span>{claim.id}</span><div><strong>{claim.text}</strong><small>{claim.category} · {claim.kind}</small></div><i aria-hidden="true">↗</i></button>)}</div>
          <div className="ml-node-list">{displayResult.nodes.map((node, index) => <button key={node.id} type="button" onClick={() => openInspector({ kind: "node", id: node.id })}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{node.layer}</small><strong>{node.title}</strong></div><i aria-hidden="true">→</i></button>)}</div>
        </div>
      </section>

      <details className="ml-stress-test">
        <summary><span>04</span><div><strong>Stress test and alternatives</strong><small>What would weaken or change the conclusion?</small></div><i aria-hidden="true">+</i></summary>
        <div className="ml-stress-grid">
          <article><span>Challenging evidence</span>{displayResult.stressTest.challengingEvidence.map((item) => <p key={item}>{item}</p>)}</article>
          <article><span>Alternative explanations</span>{displayResult.stressTest.alternatives.map((item) => <p key={item}>{item}</p>)}</article>
          <article><span>Missing information</span>{displayResult.stressTest.missingInformation.map((item) => <p key={item}>{item}</p>)}</article>
          <article><span>What changes the conclusion</span>{displayResult.stressTest.changeConditions.map((item) => <p key={item}>{item}</p>)}</article>
        </div>
      </details>

      <section className="ml-form-view" aria-labelledby="form-view-title">
        <div className="ml-subsection-head"><div><span>05</span><h3 id="form-view-title">Form Your View</h3></div><p>These prompts do not score you or provide a “correct” answer.</p></div>
        <div>{displayResult.reflectionPrompts.map((prompt, index) => <label key={prompt}><span>0{index + 1}</span><strong>{prompt}</strong><textarea rows={3} placeholder="Your notes…" aria-label={`Your notes for question ${index + 1}`} /></label>)}</div>
      </section>

      <section className="ml-deep-sources" aria-labelledby="deep-sources-title">
        <div className="ml-subsection-head"><div><span>06</span><h3 id="deep-sources-title">Inspect evidence</h3></div><p>Level 3 opens the complete source, claim or node record.</p></div>
        <SourceList sources={displayResult.sources} onOpen={openInspector} />
      </section>

      <section className="ml-limitations"><span>LIMITATIONS</span><ul>{displayResult.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>
    </section>}

    {inspectorTarget && <Inspector result={displayResult} target={inspectorTarget} onOpen={openInspector} onClose={closeInspector} closeButtonRef={closeButtonRef} />}
  </div>;
}

function Inspector({ result, target, onOpen, onClose, closeButtonRef }: { result: AnalysisResult; target: InspectorTarget; onOpen: (target: InspectorTarget) => void; onClose: () => void; closeButtonRef: RefObject<HTMLButtonElement | null> }) {
  const source = target.kind === "source" ? result.sources.find((item) => item.id === target.id) : undefined;
  const claim = target.kind === "claim" ? result.claims.find((item) => item.id === target.id) : undefined;
  const node = target.kind === "node" ? result.nodes.find((item) => item.id === target.id) : undefined;
  const title = source?.title || claim?.text || node?.title || "Evidence record";
  return <div className="ml-inspector-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <aside className="ml-inspector" role="dialog" aria-modal="true" aria-labelledby="inspector-title">
      <header><div><span>LEVEL 3 · INSPECT EVIDENCE</span><h2 id="inspector-title">{title}</h2></div><button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close evidence inspector">×</button></header>
      {source && <SourceInspector source={source} result={result} onOpen={onOpen} />}
      {claim && <ClaimInspector claim={claim} result={result} onOpen={onOpen} />}
      {node && <NodeInspector node={node} result={result} onOpen={onOpen} />}
    </aside>
  </div>;
}

function SourceInspector({ source, result, onOpen }: { source: EvidenceSource; result: AnalysisResult; onOpen: (target: InspectorTarget) => void }) {
  const presentation = sourceInspectorModel(source, result.mode);
  return <div className="ml-inspector-content">
    <div className="ml-inspector-facts"><div><span>Publisher</span><p>{source.publisher}</p></div><div><span>Date</span><p>{source.date}</p></div><div><span>Source tier</span><p>{source.sourceType}</p></div><div><span>Retrieval depth</span><p>{presentation.retrievalDepthLabel}</p></div></div>
    <section><span>{presentation.excerptLabel}</span>{presentation.excerpt ? <><blockquote>{presentation.excerpt}</blockquote>{source.excerptKind === "source-title" && <p>{presentation.excerptAvailabilityLabel}</p>}</> : <p>{presentation.excerptAvailabilityLabel}</p>}</section>
    <section><span>Linked claim</span>{source.relatedClaims.length ? <div className="ml-inspector-links">{source.relatedClaims.map((id) => <button key={id} type="button" onClick={() => onOpen({ kind: "claim", id })}>{id}</button>)}</div> : <p>No claim is directly linked.</p>}</section>
    <section><span>Evidence role</span><p><b className={`ml-role-pill ${roleClass(source.evidenceRole)}`}>{source.evidenceRole}</b></p></section>
    <section><span>Why this source matters</span><p>{source.note}</p></section>
    <section><span>Translation disclosure</span><p>{presentation.translationDisclosure}</p></section>
    <section><span>Limitations</span>{source.limitations?.length ? <ul>{source.limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{result.limitations[0] || "Read the original source in full before relying on an excerpt."}</p>}</section>
    <a className="ml-original-link" href={source.url} target="_blank" rel="noopener noreferrer">Open original source <span aria-hidden="true">↗</span></a>
  </div>;
}

function ClaimInspector({ claim, result, onOpen }: { claim: Claim; result: AnalysisResult; onOpen: (target: InspectorTarget) => void }) {
  const linkedNodes = result.nodes.filter((node) => node.evidenceIds.some((id) => claim.evidenceIds.includes(id)));
  return <div className="ml-inspector-content">
    <div className="ml-inspector-facts"><div><span>Claim ID</span><p>{claim.id}</p></div><div><span>Category</span><p>{claim.category}</p></div><div><span>Evidence status</span><p>{claim.kind}</p></div><div><span>Evidence links</span><p>{claim.evidenceIds.length}</p></div></div>
    <section><span>Statement</span><blockquote>{claim.text}</blockquote></section>
    <section><span>Supporting or challenging evidence</span><EvidenceButtons ids={claim.evidenceIds} onOpen={onOpen} empty="No direct supporting evidence is linked to this claim." /></section>
    <section><span>Related causal nodes</span>{linkedNodes.length ? <div className="ml-inspector-links">{linkedNodes.map((node) => <button key={node.id} type="button" onClick={() => onOpen({ kind: "node", id: node.id })}>{node.title}</button>)}</div> : <p>No causal node is directly linked.</p>}</section>
    <section><span>Audit boundary</span><p>{claim.kind === "Confirmed fact" ? "Eligible evidence supports this factual statement. Its wider implications remain separate." : "This statement must not be presented as a confirmed fact."}</p></section>
  </div>;
}

function NodeInspector({ node, result, onOpen }: { node: CausalNode; result: AnalysisResult; onOpen: (target: InspectorTarget) => void }) {
  const linkedClaims = result.claims.filter((claim) => claim.evidenceIds.some((id) => node.evidenceIds.includes(id)));
  return <div className="ml-inspector-content">
    <div className="ml-inspector-facts"><div><span>Node</span><p>{node.id}</p></div><div><span>Layer</span><p>{node.layer}</p></div><div><span>Inference label</span><p>{node.kind}</p></div><div><span>Calibrated category</span><p>{node.confidence}</p></div></div>
    <section><span>Reasoning</span><blockquote>{node.summary}</blockquote></section>
    <section><span>Uncertainty</span><p>{node.uncertainty}</p></section>
    <section><span>Evidence trail</span><EvidenceButtons ids={node.evidenceIds} onOpen={onOpen} empty="No source directly establishes this node." /></section>
    <section><span>Linked claims</span>{linkedClaims.length ? <div className="ml-inspector-links">{linkedClaims.map((claim) => <button key={claim.id} type="button" onClick={() => onOpen({ kind: "claim", id: claim.id })}>{claim.id}</button>)}</div> : <p>No extracted claim is directly linked.</p>}</section>
  </div>;
}
