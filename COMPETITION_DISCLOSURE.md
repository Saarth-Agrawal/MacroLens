# MacroLens AI and resource disclosure

Last audited: 25 August 2026

## AI used in the product

| System | Where used | What it does | User-visible disclosure | Required for demo? |
|---|---|---|---|---|
| Tesseract.js 7 with Tesseract LSTM language models | Browser | Neural-network OCR for English, Hindi and Marathi newspaper text | Lens panel and Method section | Only for image input |
| Gemini 3.5 Flash-Lite | Server | First decomposes the headline and plans targeted Tavily searches; a second structured call generates the complete custom result | Result and Method sections identify the two-stage design and validated-ID boundary | Required for custom research and analysis |
| Rule-based claim decomposition | Browser | Splits recognised causal connectors into event, cause and causal-link claims | Live results are labelled provisional | Yes for arbitrary headlines; this is not described as AI |
| Human-reviewed curated case data | Browser bundle | Supplies the three stable demo maps and evidence ledgers | Every case is labelled “Curated demo · pre-verified” | Yes for the competition demo |

Gemini returns claim and source assessments, citations and calibrated confidence inside a strict schema. The server removes unknown source or claim IDs before rendering. The five Council roles are perspectives generated in one call, not five independent agents. Causal hypotheses remain labelled and reviewable.

## AI used to develop the project

- OpenAI Codex in ChatGPT Work assisted with code generation, interface design, refactoring, testing, audit documentation, source discovery and concise evidence paraphrases.
- Earlier concept and interface exploration used AI-assisted prototyping, including the user’s original Bolt prototype.
- Hindi and Marathi short explanation previews were drafted with AI assistance and are labelled machine-translated and not human-verified.
- Human review is still required before the competition for translations, source excerpts and presentation claims.

## Active free/open resources

| Resource | Purpose | Cost/dependency position |
|---|---|---|
| Next.js 16.3.2 | Web framework | MIT; no licence fee |
| React 19.2.6 | Interface runtime | MIT; no licence fee |
| TypeScript 5.9.3 | Type checking | Apache-2.0; no licence fee |
| Tesseract.js 7.0.0 | Browser OCR | Apache-2.0; no licence fee |
| Inter, Sora and Noto Sans Devanagari via Fontsource | Latin and Devanagari typography | OFL-1.1; self-hosted in the bundle |
| Tavily Search | Executes Gemini-planned public-source searches and returns clean parsed text | Server-side API key; usage/plan must be disclosed before competition deployment |
| Gemini 3.5 Flash-Lite | Research planning, evidence-grounded analysis and Council perspectives | Server-side API key; usage, quota and competition eligibility must be re-audited before final submission |
| RBI, IMF, World Bank, IEA and St. Louis Fed pages | Primary/context evidence | Public pages; linked, not republished |
| Reuters article links | Independent reporting | Public article links and short paraphrases; no paid data feed |
| Cloudflare/Vinext Sites runtime | Hosting/build target | Existing project runtime; no app-level paid API dependency |

Tavily and Gemini are configured only through server-side environment variables and may consume plan credits. No provider key is committed to this repository. Re-audit provider pricing, quotas and competition eligibility before deployment.

## Data and privacy

- Images are processed by Tesseract.js in the user’s browser.
- Images are displayed with a temporary blob URL and are not sent to a MacroLens API.
- The blob URL is revoked when replaced, cleared or when the page is closed.
- The server receives only a cleaned search query for custom live retrieval.
- Gemini first receives the custom headline and returns researchable claims plus targeted Tavily queries.
- Tavily receives those planned queries and retrieves public-source text.
- Gemini then receives the headline, planned claims, selected profile and displayed source excerpts. It does not receive uploaded images.
- The current version has no user accounts, database-backed scan history or analytics.

## Known limitations to disclose

- Tavily may return cleaned public-source text, but it cannot read every page; paywalled, blocked and incomplete sources remain metadata-only.
- Live sources are labelled “Supports” only when verification-eligible read text makes a direct, non-negated, stance-clear match. Unrated sites, search snippets and title metadata are excluded from support and confidence.
- The live rules detect explicit negation, refutation cues, hedging and directional conflict. Subtle contradiction, satire and arbitrary semantic verification still require article-level human review.
- Gemini analysis may contain analytical errors. Unknown evidence and claim IDs are rejected, but users must still inspect the original sources before relying on a result.
- Full-result Hindi and Marathi translation is not complete; curated short previews are machine-generated and labelled.
- OCR accuracy depends on crop, angle, typography and lighting. Users must confirm the extracted text.
- The three curated cases are stable demonstration content, not live results.

## Presentation-safe wording

Use:

> MacroLens uses on-device neural OCR and a transparent evidence pipeline. It separates confirmed facts from inferences and causal hypotheses, and its three demo cases are pre-verified for reliability.

Do not use:

- “MacroLens verifies every headline.”
- “The model is 90% accurate.”
- “Every causal link is AI-proven.”
- “Curated demo evidence was retrieved live.”
- “Translations were human-verified.”
