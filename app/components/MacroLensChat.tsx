"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult } from "../data/demoCases";
import styles from "./MacroLensChat.module.css";

type ChatRole = "user" | "assistant";
type ChatSource = { id: string; title: string; url: string; publisher: string };
type ChatMessage = { id: string; role: ChatRole; text: string; sources?: ChatSource[]; searched?: boolean };

function buildContext(headline: string, result: AnalysisResult | null) {
  if (!result) return { headline, analysisAvailable: false };
  return {
    headline: result.headline,
    analysisAvailable: true,
    evidenceStatus: result.bottomLine.evidenceStatus,
    bottomLine: result.bottomLine.explanation,
    keyImplication: result.bottomLine.keyImplication,
    keyUncertainty: result.bottomLine.keyUncertainty,
    claims: result.claims.slice(0, 8).map((claim) => ({ id: claim.id, text: claim.text, status: claim.kind, evidenceIds: claim.evidenceIds })),
    causalPath: result.nodes.slice(0, 6).map((node) => ({ layer: node.layer, title: node.title, summary: node.summary, uncertainty: node.uncertainty, evidenceIds: node.evidenceIds })),
    sources: result.sources.slice(0, 6).map((source) => ({ id: source.id, title: source.title, publisher: source.publisher, role: source.evidenceRole, excerpt: source.excerpt?.slice(0, 800), note: source.note.slice(0, 500) })),
    limitations: result.limitations.slice(0, 5),
  };
}

export default function MacroLensChat({ headline, result }: { headline: string; result: AnalysisResult | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const context = useMemo(() => buildContext(headline, result), [headline, result]);
  const contextKey = `${headline.normalize("NFKC").trim()}::${result?.id || "pending"}`;

  useEffect(() => {
    setMessages([]);
    setDraft("");
    setError("");
  }, [contextKey]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const question = draft.trim().slice(0, 500);
    if (!question || busy) return;
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: question };
    const nextMessages = [...messages, userMessage].slice(-10);
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: nextMessages.slice(0, -1).map(({ role, text }) => ({ role, text })), context }),
      });
      const payload = await response.json() as { answer?: string; reason?: string; searched?: boolean; sources?: ChatSource[] };
      if (!response.ok || !payload.answer) throw new Error(payload.reason || "The MacroLens assistant is unavailable.");
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: payload.answer!, searched: payload.searched, sources: payload.sources }].slice(-12));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The MacroLens assistant is unavailable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={styles.root} aria-label="MacroLens assistant">
      {open && <section id="macrolens-chat-panel" className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="macrolens-chat-title">
        <header className={styles.header}>
          <span className={styles.mark} aria-hidden="true">ML</span>
          <div><strong id="macrolens-chat-title">Ask MacroLens</strong><small>Gemini · Tavily research</small></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close MacroLens assistant">×</button>
        </header>
        <div className={styles.contextStrip}><i />{result ? "Current analysis attached" : "Headline context attached"}</div>
        <div className={styles.messages} ref={scrollRef} aria-live="polite">
          {!messages.length && <div className={styles.welcome}><span>RESEARCH DESK</span><strong>What would you like to understand?</strong><p>Ask about the headline, its evidence, economic implications, uncertainty, or recent developments. MacroLens can search the web when the displayed analysis is not enough.</p></div>}
          {messages.map((message) => <article key={message.id} className={message.role === "user" ? styles.user : styles.assistant}><span>{message.role === "user" ? "YOU" : message.searched ? "ML · WEB CHECKED" : "ML · ANALYSIS CONTEXT"}</span><p>{message.text}</p>{message.sources?.length ? <div className={styles.webSources}><b>WEB SOURCES</b>{message.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><span>{source.id}</span><p><strong>{source.title}</strong><small>{source.publisher}</small></p><i>↗</i></a>)}</div> : null}</article>)}
          {busy && <div className={styles.typing}><i /><i /><i /><span>Checking the analysis and web evidence…</span></div>}
          {error && <div className={styles.error} role="alert">{error}</div>}
        </div>
        <form className={styles.composer} onSubmit={submit}>
          <label htmlFor="macrolens-chat-input">Ask about this analysis</label>
          <div><input ref={inputRef} id="macrolens-chat-input" value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 500))} maxLength={500} placeholder="What does this mean for households?" disabled={busy} /><button type="submit" disabled={busy || !draft.trim()} aria-label="Send question">↑</button></div>
          <small>Uses the displayed evidence and Tavily web research when needed. Verify important decisions at the original sources.</small>
        </form>
      </section>}
      <button className={styles.launcher} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="macrolens-chat-panel" aria-label={open ? "Close MacroLens assistant" : "Open MacroLens assistant"}><span>ML</span><i /><b>{open ? "×" : "Ask"}</b></button>
    </aside>
  );
}
