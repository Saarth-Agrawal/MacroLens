# MacroLens competition MVP

MacroLens is an evidence-linked media-intelligence prototype for the HKU AI+ Challenge Mumbai Regional Round.

> Signal → Mechanism → Relevance

The competition flow turns a typed, pasted or scanned headline into checkable claims, a causal map, a stress test, categorical confidence and an inspectable evidence ledger. It does not issue a universal true/false verdict.

## Current architecture

- Next.js 16.3.2, React 19 and TypeScript
- Vinext/Vite build targeting a Cloudflare Worker
- Tesseract.js 7 on-device OCR (`eng`, `hin`, `mar`)
- Tavily public-source search and clean-text retrieval when `TAVILY_API_KEY` is configured, with GDELT DOC 2.0 and Google News RSS fallbacks
- No database, accounts or image uploads to the server
- Three fixed pre-verified competition cases in `app/data/demoCases.ts`
- Conservative live metadata mode for arbitrary headlines

## Reliability contract

- Curated and live results are never presented as the same thing.
- Live sources can support a claim only when Tavily returns matching public-source text; otherwise titles remain clearly labelled metadata/context only.
- Every causal node exposes its statement type, confidence category, evidence links and uncertainty.
- Missing evidence activates the exact insufficient-evidence safeguard.
- OCR text must be reviewed and confirmed before analysis.
- Analytic confidence never uses a fabricated percentage.

## Local verification

```bash
npm run verify:competition
npm audit --omit=dev
```

The test suite performs a bounded production build, checks the complete server-rendered competition surface, rejects empty retrieval requests and verifies the optional generative route fails transparently when unconfigured.

See `TEST_PLAN.md` for the competition scenario matrix and `COMPETITION_DISCLOSURE.md` for the AI, dependency and resource disclosure.

## Deployment rule

The stable local build must be reviewed before creating a hosting checkpoint. Do not deploy directly from an unreviewed development state.
