# MacroLens Competition MVP Verification Report

**Test date:** 22 August 2026  
**Build under test:** Hindi newspaper regression release and its matching Sites preview/runtime
**Prepared for:** HKU AI+ Challenge Mumbai Regional Round

## Outcome

The Spatial Intelligence redesign, prepared demonstrations, claim-level safety controls, OCR fixtures and failure paths work. Priority 1 is **not fully complete**.

Arbitrary live evidence retrieval remains **BLOCKED in both preview and production**. An unseen headline submitted to the public deployment returned no sources after 17.09 seconds because Google News RSS and GDELT both timed out from the deployed server environment. MacroLens correctly showed `LIVE RETRIEVAL UNAVAILABLE`, Low confidence and an empty ledger. It did not substitute a curated result.

The release-blocking Hindi clipping now **passes in the actual preview**. MacroLens automatically selected the central three-line headline and extracted exactly `लीक से हटकर बनाए मोटा मुनाफा`, with 72% character confidence and 93% headline-selection confidence. Analysis remained locked until one confirmation click. This is a pass for that regression fixture, not proof that arbitrary Hindi or Marathi pages are reliable. The broader ten-image genuine-newspaper matrix still has one automatic pass and nine safe failures/manual-selection cases. Physical-phone behavior remains awaiting manual confirmation.

## Test environment

| Item | Value |
|---|---|
| Application | MacroLens competition MVP |
| Public production URL | `https://macrolens-ripple-intelligence.krishiv-r.chatgpt.site` |
| Public deployment | Latest saved Sites release; public URL unchanged |
| Public access | `public`; unauthenticated GET and POST requests used no owner cookies or preview access |
| Actual preview | `http://terminal.local:4173/` (Sites agent-preview origin) |
| Browser | Cloud Chrome controlled through the preview browser interface |
| Desktop viewport | 1363 × 936 CSS px; document client width 1348 px |
| Mobile viewport | 390 × 844 harness, 375 px inner document width after browser scrollbar |
| Runtime | Next.js 16.3.2, React 19.2.6, Vinext/Vite Sites runtime |
| OCR | Tesseract.js 7.0.0; two-stage layout/candidate pass followed by isolated-region reread; one selected language model per scan |
| OCR languages | English (`eng`), Hindi (`hin`), Marathi (`mar`) |
| Network condition | GDELT/Google News RSS unavailable from both preview and deployed Sites server |
| Recovery point before gap closure | Git commit `ed44b02`, tag `competition-baseline-before-live-retrieval-2026-08-22` |
| Runtime feature checkpoint | Git commit `9d3a94b` (`Fix automatic newspaper headline detection`) |

## Public production verification

The deployment status was read directly from Sites after the checkpoint monitor completed: `succeeded`, with the public URL above. The final public home page returned HTTP 200 in 6.54 seconds without owner authentication. The official deployment renderer also produced the production screenshot below.

The Sites-controlled interaction browser is intentionally scoped to agent previews and cannot be navigated to a live Sites URL. Therefore a fresh automated production-browser click-through is **BLOCKED by the testing surface**. Production was instead tested with unauthenticated public HTTP requests and the official production renderer. This is not described as equivalent to physical-browser interaction.

| Production test | Input | Expected | Actual output | Proof | Status |
|---|---|---|---|---|---|
| Public access | `GET /?verification=v6` with no session cookie | Public page loads without owner access | HTTP 200 in 6.544 s | Response headers plus production renderer | **PASS** |
| Production design | Deployed runtime commit `d6bac28` | Scanner above fold; live Lens and prepared demos visible | Renderer shows `TRY THE LIVE LENS`, demo buttons and input dock above fold | [Production renderer screenshot](sandbox:/workspace/scratch/macrolens-production-v5.png) | **PASS** |
| Capability labels | Public HTML | Curated, live and unavailable states are visibly distinct | HTML contains `CURATED DEMO`, `LIVE ANALYSIS` and `LIVE RETRIEVAL UNAVAILABLE` | Public HTML search result | **PASS** |
| Unseen-headline retrieval | `POST /api/news` with `India imposes sugar stockholding limits on bulk consumers as prices rise` | Real recent claim-linked sources | HTTP 200 in 16.761 s; zero articles; both providers timed out | Exact JSON below | **FAIL / BLOCKED** |
| No silent fallback | Same unseen headline | Curated evidence must not appear | Provider `offline`; `evidenceDepth: none`; exact no-substitution limitation | Exact JSON below | **PASS** |
| Fresh production browser | Public URL, no owner session | Execute interactive UI in a fresh browser | Sites browser cannot navigate live Sites URLs; physical browser not available | Testing-surface restriction | **BLOCKED** |

Exact public unseen-headline response:

```json
{
  "articles": [],
  "provider": "offline",
  "retrievalStatus": "unavailable",
  "evidenceDepth": "none",
  "diagnostics": {
    "googleNews": "timeout",
    "gdelt": "timeout"
  },
  "limitation": "LIVE RETRIEVAL UNAVAILABLE. The public feeds did not return usable sources. No curated evidence has been substituted."
}
```

**Retrieved sources:** none. Consequently no production source titles, publishers, dates or URLs can honestly be listed, no claim received a live citation, and the evidence ledger remained empty. Live retrieval is not passed.

### Network diagnosis

| Candidate cause | Finding |
|---|---|
| Preview-only restrictions | Ruled out: the production deployment produced the same failure. |
| Incorrect GDELT endpoint | Ruled out: the implementation uses the documented DOC 2.0 endpoint and valid query formatting. |
| Request formatting / feed parsing | Google News RSS returned a large valid RSS document when requested outside Sites; the parser handles normal RSS item fields. Production timed out before parsing. |
| GDELT rate limits | Confirmed as an additional risk: direct diagnostics received HTTP 429 on shared infrastructure, including after a short retry. |
| CORS | Relevant to browser fallbacks, not the server-route timeout. A direct browser GDELT fallback was added, but it is not reliable under shared-IP rate limits. |
| Timeout | Confirmed in production diagnostics for both providers. |
| Deployment configuration | No missing key or paid API is involved; outbound provider reachability is the limiting condition. |

Production network access does **not** improve on preview access for these feeds. The competition-safe current path is the clearly labelled pre-verified demo. A future live path should use a separately deployed, no-cost retrieval relay with caching and rate limiting, and it must pass this same unseen-headline production test before being called live. This alternative has not been introduced into the competition build.

## Preserved visual proof

| Proof | File | SHA-256 |
|---|---|---|
| Public production renderer, runtime `d6bac28` | [macrolens-production-v5.png](sandbox:/workspace/scratch/macrolens-production-v5.png) | `a97167ab814cfabf2d0ca39316d62db85d7ae14be355d384a99dc0f55c24fcd2` |
| Final above-fold preview interaction | [macrolens-v5-above-fold.jpg](sandbox:/workspace/scratch/macrolens-v5-above-fold.jpg) | `bcd0f5dd4bc0226a2ba6cab6d660dbb7ed87bab127d294e6ab60ab3601c38ff6` |
| Before redesign | [macrolens-before.jpg](sandbox:/workspace/scratch/macrolens-before.jpg) | `9d0da0d527454738942a89e9ba65e89b95d49cddf0a250d1e76ee4d94146ea32` |
| After redesign, desktop | [macrolens-after-desktop.jpg](sandbox:/workspace/scratch/macrolens-after-desktop.jpg) | `5ad9da657e1df7b9d17439a90db73ea340992b42a0f44ac83fec243f9c791590` |
| Selected causal node and inspector | [macrolens-causal-map-tested.jpg](sandbox:/workspace/scratch/macrolens-causal-map-tested.jpg) | `8f5facf95d6283d7c2f4259e72c6e9dd1b50396233b022c8ed02f31295e4ffdb` |
| After redesign, 390 × 844 mobile frame | [macrolens-after-mobile.jpg](sandbox:/workspace/scratch/macrolens-after-mobile.jpg) | `1449ba65d88decdbf2f8ef09ab3fefe728241044c8c3aef1d841ecdd9d7a9486` |
| Hindi blocker: exact text plus highlighted central region | [macrolens-hindi-regression-final.jpg](sandbox:/workspace/scratch/macrolens-hindi-regression-final.jpg) | `ab54394d6aef988fa8f509f3e04d6d2aaf0aa274d15f26a8e5db25fd09c6336d` |
| Hindi blocker: separate confidences, one-click confirmation and enabled analysis | [macrolens-hindi-regression-confirmed.jpg](sandbox:/workspace/scratch/macrolens-hindi-regression-confirmed.jpg) | `cb208bb5db647d2294efd7aa97a16ea33d95eeb7e4670392227127df5a0ce28c` |
| Zero-source compact failure state | [macrolens-zero-source-failure.jpg](sandbox:/workspace/scratch/macrolens-zero-source-failure.jpg) | `eab1b582317efd35d5e6b6d0a823238a912b64d159bdfa0294d4b12daf504968` |

## Preview scenario results

Every row below was executed against the running preview. Static component existence is not counted as proof.

| ID | Feature / input | Expected output | Actual preview output | Proof | Result |
|---|---|---|---|---|---|
| T01 | Typed English: `Oil prices rise after shipping disruption` | Input accepted; complete claims; unsupported causation not confirmed | `Oil prices rise.` (Event), `A shipping disruption occurred.` (Cause), and `The headline proposes that “A shipping disruption occurred” contributed to “Oil prices rise”.` (Causal hypothesis); Low confidence; empty ledger | Browser interaction plus automated retest | **PASS** for input/decomposition; **BLOCKED** for live retrieval |
| T02 | Clipboard paste: `Red Sea attacks force shipping reroutes and raise trade costs` | Pasted text remains exact and loads stable prepared case | Exact pasted value; `CURATED DEMO · PRE-VERIFIED`; four claims; pipeline `COMPLETE`; four ledger rows | Browser clipboard interaction | **PASS** |
| T03 | Clean English scan image | Read headline and require confirmation | `RBI KEEPS REPO RATE AT 5.25 PERCENT`; `Detected: English`; `Text extracted · OCR estimate 92%. Check every word before analysis.` | Camera/upload browser interaction | **PASS** |
| T04 | Clean Hindi scan image | Read Hindi headline and detect Hindi | `आरबीआई ने रेपो दर स्थिर रखी`; `Detected: Hindi`; displayed OCR estimate 94% | Browser file-upload interaction | **PASS after fixture retest** |
| T05 | Clean Marathi scan image | Read Marathi headline and detect Marathi | `आरबीआयने रेपो दर कायम ठेवली`; `Detected: Marathi`; displayed OCR estimate 95% | Browser file-upload interaction | **PASS** |
| T06 | Blurry newspaper image | Reject unreliable OCR and block analysis | First run incorrectly accepted a 68% result: `Gn WY RBI KEEPS REPO RATE AT 5.25% PERCENT`. After fix/retest: headline `''`; `OCR could not find a reliable headline. Crop closer, improve lighting, retry, or type the text manually.`; confirm disabled; analyse disabled | Browser output before and after fix | **PASS after fix** |
| T07 | Camera capture control | Open the capture input and return an image to OCR | `Open camera` opened a single-file chooser from the `capture="environment"` input; test image returned; OCR produced exact English text at 92% | Browser file-chooser result: `{ opened: true, multiple: false }` | **PASS** for capture-input path; physical camera hardware **BLOCKED** |
| T08 | Editable OCR and confirmation gate | User can correct text; analysis blocked until confirmed | Early Analyse action produced `Check the OCR text and choose “Use corrected text” before analysis.`; corrected textarea accepted; button changed to `✓ OCR text confirmed`; prepared RBI result then loaded | Browser alert and corrected-value output | **PASS** |
| T09 | Typed Hindi: `आरबीआई ने रेपो दर स्थिर रखी` | Detect Hindi and fail safely if evidence unavailable | `Detected: Hindi`; exact headline retained; one `Unverified claim`; Low confidence; `FALLBACK READY` | Browser interaction result | **PASS** for language/input; live retrieval **BLOCKED** |
| T10 | Typed Marathi: `आरबीआयने रेपो दर कायम ठेवली` | Detect Marathi and fail safely if evidence unavailable | `Detected: Marathi`; exact headline retained; one `Unverified claim`; Low confidence; `FALLBACK READY` | Browser interaction result | **PASS** for language/input; live retrieval **BLOCKED** |
| T11 | Misleading causal wording | Separate event, cause and implied mechanism | Three claims; event and cause remain unverified; implied causal link labelled `Causal hypothesis` | T01 exact output | **PASS** |
| T12 | Opinion presented as fact: `The RBI's pause is a disastrous mistake` | Do not convert opinion into confirmed fact | `UNVERIFIED CLAIM`; exact insufficient-evidence warning; Low confidence; zero ledger rows | Browser output | **PASS** |
| T13 | Satire: `RBI replaces repo rate with free pizza Fridays` | Do not invent evidence or a true/false verdict | `UNVERIFIED CLAIM`; exact insufficient-evidence warning; Low confidence; zero ledger rows | Browser output | **PASS** for conservative safeguard; no satire classifier |
| T14 | Unsupported claim: `India has abolished inflation permanently` | Show exact safeguard and empty ledger | `There is currently insufficient reliable evidence to verify this claim.`; `Low confidence`; `No evidence ledger available`; `FALLBACK READY` | Browser output | **PASS** |
| T15 | Outdated claim: `RBI raises repo rate to 6.50% in February 2023` | Do not verify without dated supporting evidence | Claim remained `UNVERIFIED`; exact insufficient-evidence warning; Low confidence; limitations displayed | Browser output | **PASS** for evidence safeguard; no dedicated stale-claim classifier |
| T16 | Conflicting evidence: AI/data-centre prepared case | Show support, context and contradiction without flattening disagreement | Roles exactly `Supports`, `Supports`, `Adds context`, `Contradicts`; S4 states a 670 TWh headwind scenario versus the 945 TWh base case; Stress Test visible | Browser ledger output and verified Reuters URL | **PASS** |
| T17 | Weak evidence: `Anonymous post says the rupee will double tomorrow` | Do not treat the assertion as evidence | One `Unverified claim`; Low confidence; exact insufficient-evidence warning; empty ledger; retrieval fallback | Browser interaction result | **PASS** |
| T18 | Spelling errors: `Oil prises rise after shiping disruption` | Preserve input, still isolate implied causal link, do not guess facts | Claims: `Oil prises rise.`, `shiping disruption.`, and an implied causal hypothesis; exact insufficient-evidence warning | Browser DOM snapshot | **PASS** for safe decomposition; no spell correction |
| T19 | Retrieval failure | No blank screen, fabricated source or confident answer | `LIVE RETRIEVAL UNAVAILABLE`; `The public feeds did not return usable sources. No curated evidence has been substituted.`; Retry action and three prepared demos remain visible | Preview and public production output | **PASS** fallback; retrieval itself **BLOCKED** |
| T20 | Loading states | Observable, understandable progress | Button `Tracing evidence…`, disabled; pipeline `DECOMPOSING CLAIMS`; stage list `Decomposing claims / Retrieving evidence / Linking evidence / Complete` | Browser output captured during active run | **PASS after timing fix** |
| T21 | Causal-map selection | Selected node opens its reasoning and linked evidence | Selected `Capacity and insurance transmit cost`; inspector showed `Evidence-supported inference`, uncertainty, Reuters `Supports`, St. Louis Fed `Adds context`, and working source preview | [Causal map screenshot](sandbox:/workspace/scratch/macrolens-causal-map-tested.jpg) and DOM result | **PASS** |
| T22 | India/youth and quiet winners/losers | Relevance and affected groups remain concise and conditional | Youth text referenced education loans and job-creating investment; winner/loser lists visible with `Potential exposure` labels | Browser result text | **PASS** |
| T23 | Desktop responsive layout | New spatial layout, no horizontal overflow, readable contrast | HTML/body client width = scroll width = 1348 px; heading contrast 18.36:1; lead contrast 9.81:1; Sora headings and Inter body | Browser computed-style output and desktop screenshot | **PASS** |
| T24 | Mobile 390 × 844 layout | Stack cleanly with no horizontal overflow | Inner document client width 375 px and scroll width 375 px; map and inspector each 355 px; results stack vertically; navigation collapses | Browser iframe viewport metrics and mobile screenshot | **PASS** for responsive viewport; physical phone **BLOCKED** |
| T25 | Machine-labelled output language | Hindi and Marathi previews must not appear human-verified | Both languages display `Machine-translated preview · not human-verified`; exact Hindi and Marathi short frames rendered | Browser select interaction | **PASS** |

## Strengthened claim-decomposition tests

The cleanup now produces complete sentences and labels every claim as Event, Cause, Consequence or Causal hypothesis. These five headlines were not added to the curated demo cases.

| Unseen headline | Exact output | Result |
|---|---|---|
| `Copper prices fall after China factory data disappoints` | `Copper prices fall.` — Event; `China factory data disappoints.` — Cause; `The headline proposes that “China factory data disappoints” contributed to “Copper prices fall”.` — Causal hypothesis | **PASS** |
| `Airline shares climb as crude oil costs retreat` | `Airline shares climb.` — Event; `Crude oil costs retreat.` — Cause; causal-link sentence labelled Causal hypothesis | **PASS** |
| `Government raises import duty, pushing smartphone prices higher` | `Government raises import duty.` — Event; `Smartphone prices may rise.` — Consequence; causal-link sentence labelled Causal hypothesis | **PASS** |
| `Rupee weakness leads to higher import costs` | `A rupee weakness occurred.` — Cause; `The reported consequence was higher import costs.` — Consequence; causal-link sentence labelled Causal hypothesis | **PASS** |
| `Monsoon delays disrupt onion supplies across Maharashtra` | `Monsoon delays disrupt onion supplies across Maharashtra.` — Event | **PASS** |

The decomposition is deterministic grammatical cleanup, not semantic fact verification. Awkward or ambiguous grammar can still require user correction.

## Genuine-newspaper OCR regression evidence

Controlled fixtures prove the upload, language-model selection, confirmation gate and editable-text workflow; they do not prove real-world OCR reliability. The matrix below was executed against the actual running preview with genuine newspaper/news-page images or a clipping cut from a genuine page. Automatic results are accepted only when the selected region and text are both plausible. `SAFE FAIL` means analysis stayed blocked and the user was sent to the visual selector/manual correction flow.

| Image | Expected headline | Automatic candidate | Final OCR | User actions required | Time | Result |
|---|---|---|---|---:|---:|---|
| English Independent front page; full page, multiple headlines | `Exposed: myth of the global warming pause` | Wrong vertical/masthead region; selection 80% | `Fas eo A Ls po’`; character confidence 31%; now rejected by the low-character-confidence gate | Visual selection + correction | 19.5 s | **FAIL / SAFE FAIL after gate fix** |
| English newspaper photograph; small distant print | A readable Guardian story headline | No reliable candidate | No text accepted; exact UI output: `No reliable headline region was detected. Draw a box around one headline or type it manually.` | Visual selection + correction | ~4 s | **FAIL safely** |
| Hindi Economic Times clipping supplied by the user; full article clipping | `लीक से हटकर बनाए मोटा मुनाफा` | Central three-line region, candidate 01; 93% selection confidence | `लीक से हटकर बनाए मोटा मुनाफा`; 72% character confidence; no body contamination | **1 confirmation click** | ~12.5 s cold | **PASS** |
| Hindi Dainik Jagran full page; multiple headlines | `कांग्रेस अपनी उच्च परम्पराओं का कायम नहीं रख सकी` | Region expanded across masthead and more than one headline | 213-character mixed draft beginning `तवामिलता में शेरतता...`; rejected with the body-text warning | Visual selection + correction | ~13.5 s | **FAIL safely** |
| Same Hindi page; angled photograph | Same principal headline | Large mixed region | Draft withheld; exact body-text warning; analysis disabled | Visual selection + correction | ~13.5 s | **FAIL safely** |
| Hindi Jagran news-page screenshot; many stories | `हम आतंकवाद की कमर तोड़ देंगे : मोदी` | Dense multi-story region | Draft withheld; exact body-text warning; analysis disabled | Visual selection + correction | ~7 s | **FAIL safely** |
| Marathi Lokmat modern front page; multiple headlines | `कोणत्याही परिस्थितीत पीडिताला न्याय अन् आरोपींना शिक्षा मिळेल` | Main story plus its deck | OCR began with the expected headline but continued into a 151-character deck; four-line/density safeguard added and result rejected | Visual selection + correction | ~15.5 s | **FAIL safely after gate fix** |
| Marathi clipping cut from that genuine front page | Same principal headline | Dense headline-plus-deck grouping | Draft withheld; exact body-text warning; analysis disabled | Draw/select headline + correction | ~10 s | **FAIL safely** |
| Historic Marathi front page | `केळगांव समाचार` masthead / principal page heading | Complex masthead and columns | Draft withheld; exact body-text warning; analysis disabled | Visual selection + correction | ~10 s | **FAIL safely** |
| Same Marathi page at 220 × 165 | `केळगांव समाचार` | Low-resolution mixed region | Draft withheld; exact body-text warning; analysis disabled | Higher-resolution image required | ~10 s | **FAIL safely** |

### Release-blocker acceptance evidence

```json
{
  "expected": "लीक से हटकर बनाए मोटा मुनाफा",
  "actual": "लीक से हटकर बनाए मोटा मुनाफा",
  "automaticCandidate": 1,
  "characterConfidence": "72%",
  "headlineSelectionConfidence": "93%",
  "bodyTextContamination": false,
  "confirmationClicks": 1,
  "analysisEnabledBeforeConfirmation": false,
  "analysisEnabledAfterConfirmation": true
}
```

The visual selector now replaces all coordinate sliders. It provides a large processed preview, automatic candidate boxes, up to three one-click suggestions, a draggable/resizable crop rectangle, direct draw selection, zoom controls and `Read drawn selection`. The blocker passed without manual crop coordinates. Broader arbitrary full-page Devanagari OCR remains **PARTIAL**, as the safe failures above show.

### Body-text validation and failed-analysis retests

An edited 522-character Hindi paragraph was entered after OCR. Actual output: analysis disabled and `This appears to contain article body text rather than one headline. Select a smaller headline region before analysis.`

The exact blocker headline was then confirmed and submitted. Retrieval returned zero usable sources (`googleNews: fetch_failed`; `gdelt: timeout`). Actual rendered state:

- one `LIVE RETRIEVAL UNAVAILABLE` badge;
- one compact failure card;
- source language Hindi;
- explanation language English;
- machine translation not human-verified;
- Edit, Retry and prepared-demo controls;
- zero causal maps and zero Stress Test sections;
- no winners, losers or unsupported `Why it matters` content.

## Capability-state separation

The result header and methodology now use three mutually exclusive labels:

- `CURATED DEMO · PRE-VERIFIED` — fixed evidence and causal map prepared before the session.
- `LIVE ANALYSIS` — shown only when a custom request returns actual provider results.
- `LIVE RETRIEVAL UNAVAILABLE` — provider failure; Low confidence; no curated substitution.

Live headline-feed metadata is conservatively labelled `Adds context` or `Insufficient evidence`. It is never automatically promoted to `Supports` or `Contradicts` without article-level analysis.

## Exact key outputs

### Unsupported-claim safeguard

```text
Headline: “India has abolished inflation permanently”
Claim label: UNVERIFIED CLAIM
Frame: There is currently insufficient reliable evidence to verify this claim.
Confidence: Low
Pipeline: FALLBACK READY
Ledger: No evidence ledger available
```

### Blurry-image retest

```json
{
  "headline": "",
  "status": "OCR could not find a reliable headline. Crop closer, improve lighting, retry, or type the text manually.",
  "confirmEnabled": false,
  "analyseEnabled": false
}
```

### Active loading state

```json
{
  "button": "Tracing evidence…",
  "enabled": false,
  "pipeline": "DECOMPOSING CLAIMS — Separating the headline into individually checkable claims…",
  "loadingStages": ["Decomposing claims", "Retrieving evidence", "Linking evidence", "Complete"]
}
```

### Conflict detection

```text
S1 Supports
S2 Supports
S3 Adds context
S4 Contradicts

S4 evidence: the IEA headwind scenario is 670 TWh versus 945 TWh in the base case,
challenging any claim that the projected outcome is certain.
```

## Priority 1 feature matrix

| Priority 1 feature | Final status | Executed proof |
|---|---|---|
| Typed headline input | **PASS** | T01, T09, T10, T12–T18 |
| Pasted headline input | **PASS** | T02 clipboard interaction |
| Image upload | **PASS** | T03–T06 plus ten-image genuine-newspaper matrix |
| Camera input, where supported | **PASS / BLOCKED hardware** | T07 capture-file path passed; no physical camera in cloud browser |
| English OCR | **PASS fixtures / PARTIAL real-world** | T03 exact fixture; two genuine automatic-page tests failed safely and require visual selection |
| Hindi OCR | **PASS release blocker / PARTIAL arbitrary pages** | Exact genuine clipping passed automatically at 72% character / 93% selection confidence with one click; three other genuine full-page/angled/screenshot cases failed safely |
| Marathi OCR | **PASS fixtures / PARTIAL real-world** | T05 exact fixture; four genuine/derived page cases were blocked for dense, mixed or low-resolution text |
| Editable extracted text | **PASS** | T08 |
| Language detection | **PASS** | T03–T05, T09–T10 |
| Claim decomposition | **PASS with known linguistic limits** | T01, T11, T18 plus five unseen grammatical-cleanup tests |
| Live evidence retrieval | **FAIL / BLOCKED** | Preview and public production both returned unavailable; unseen production headline produced zero sources |
| Source-type classification | **PASS** | T16 ledger: official/primary, data/analysis, independent reporting |
| Supporting-evidence detection | **PASS curated / BLOCKED live** | T16 S1/S2; live title metadata is never promoted automatically |
| Contradicting-evidence detection | **PASS curated / BLOCKED live** | T16 S4; no production live evidence returned |
| Contextual-evidence detection | **PASS curated / BLOCKED live retrieval** | T16 S3 and Red Sea S4; live retrieval returned zero articles |
| Claim-linked citations | **PASS curated / BLOCKED live** | Curated claim cards show S IDs; unseen production case had no sources to link |
| Fact, inference and hypothesis labels | **PASS** | Curated claims/nodes and custom causal tests |
| Signal → Mechanism → Relevance map | **PASS** | T21 and screenshot |
| Clickable causal nodes | **PASS** | T21 |
| India and youth relevance | **PASS** | T22 |
| Quiet winners and losers | **PASS** | T22 |
| Confidence labels and explanations | **PASS** | High curated and Low fallback outputs; no percentages |
| Alternative explanations | **PASS** | T16 Stress Test |
| Stress Test | **PASS** | T16, four required subsections |
| Insufficient-evidence safeguard | **PASS** | T12–T19 exact wording |
| Evidence ledger | **PASS curated / PASS safe-empty fallback / BLOCKED live population** | Four-row curated ledgers; unseen production case correctly remained empty |
| Loading states | **PASS** | T20 |
| Error states | **PASS** | T06 OCR error, T08 confirmation error, 522-character body gate and compact zero-source result |
| Cached/prepared demo fallback | **PASS** | Three clearly labelled curated cases |
| Mobile responsiveness | **PASS preview / BLOCKED physical device** | T24 actual 375 px layout, no overflow; phone checklist awaiting |
| Desktop responsiveness | **PASS** | T23 actual 1363 px preview |

## Citation audit

All twelve prepared-case links were checked on 22 August 2026. Publisher, date, title and evidence role were compared with the page content. The RBI link was changed from an archive to the direct resolution. The UNCTAD link, which rejected the verification crawler, was replaced with an accessible World Bank analysis covering the same rerouting and capacity mechanism.

| Case / ID | Source and verified date | What the page establishes | Role correctness | URL result |
|---|---|---|---|---|
| RBI S1 | [RBI MPC Resolution](https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=63287), 2026-08-05 | Unanimous 5.25% hold and neutral stance | Supports C1/C2 | **PASS** |
| RBI S2 | [Reuters: central bank holds rates](https://www.reuters.com/world/india/indian-central-bank-holds-rates-expected-taking-comfort-still-modest-inflation-2026-08-05/), 2026-08-05 | Hold, neutral stance and wait for clearer inflation evidence | Supports C1/C2/C3 | **PASS** |
| RBI S3 | [Reuters: panel signals possible hikes](https://www.reuters.com/world/india/india-rate-panel-signals-impending-hikes-eyes-inflation-path-gauge-timing-2026-08-19/), 2026-08-19 | Minutes complicate any permanent-pause interpretation | Adds context to C3 | **PASS** |
| RBI S4 | [RBI Database on Indian Economy](https://data.rbi.org.in/DBIE/#/dbie/home), continuously updated | Macro/banking series, not borrower-specific EMI proof | Insufficient evidence for C4 | **PASS** |
| Red Sea S1 | [IMF: Red Sea Attacks Disrupt Global Trade](https://www.imf.org/en/blogs/articles/2024/03/07/red-sea-attacks-disrupt-global-trade), 2024-03-07 | Suez trade fell; Cape traffic and delivery times rose | Supports C1/C2 | **PASS** |
| Red Sea S2 | [World Bank: prolonged Suez rerouting](https://blogs.worldbank.org/en/trade/will-prolonged-rerouting-ships-suez-trigger-new-supply-chain-crisis), 2024-01-19 | 3,000–3,500 nautical-mile detour, added time and absorbed capacity | Supports C1/C2 | **PASS** |
| Red Sea S3 | [Reuters: Suez freight down 45%](https://www.reuters.com/world/middle-east/freight-through-suez-canal-down-45-since-houthi-attacks-unctad-2024-01-26/), 2024-01-26 | Diversion, delay, higher costs and freight-rate pressure | Supports C1/C3 | **PASS** |
| Red Sea S4 | [St. Louis Fed: Red Sea ripples](https://www.stlouisfed.org/on-the-economy/2024/feb/shipping-disruptions-red-sea-ripples-globe), 2024-02-15 | Longer routes reduce effective capacity and lift costs; final pass-through is conditional | Adds context to C3/C4 | **PASS** |
| AI S1 | [IEA: Energy demand from AI](https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai), report published 2025-04-10 | Base case reaches about 945 TWh by 2030 and explicitly describes uncertainty | Supports C1/C2 | **PASS** |
| AI S2 | [IEA: Energy and AI executive summary](https://www.iea.org/reports/energy-and-ai/executive-summary), report published 2025-04-10 | Demand more than doubles; AI is the most important growth driver | Supports C1/C2 | **PASS** |
| AI S3 | [IEA: 2026 data-centre update](https://www.iea.org/news/data-centre-electricity-use-surged-in-2025-even-with-tightening-bottlenecks-driving-a-scramble-for-solutions), 2026-04-16 | Demand grew while per-task efficiency improved and bottlenecks tightened | Adds context to C2/C3 | **PASS** |
| AI S4 | [Reuters: trade-war headwinds](https://www.reuters.com/technology/artificial-intelligence/global-trade-war-may-produce-headwinds-nascent-ai-sector-iea-says-2025-04-10/), 2025-04-10 | Headwind scenario and delays materially challenge certainty about the base case | Contradicts C3/C4 certainty | **PASS** |

No quotation, publisher, URL or publication date in the prepared ledgers was invented during this audit.

## Bugs discovered, fixes and retests

| Bug | Failure observed | Fix | Retest |
|---|---|---|---|
| All OCR models loaded for each scan | First English OCR attempt took roughly 14 minutes | Added explicit OCR-language selector and load only `eng`, `hin` or `mar` | English 92% in ~0.7 s; Hindi 94% in ~0.6 s; Marathi 95% |
| Hindi blocker selected ~420 characters of body copy | Full-page OCR sorted by longest text and analysed a corrupted extraction | Replaced it with a two-stage layout/candidate pipeline, central/prominence ranking, isolated line rereads and a mandatory plausible-headline gate | Attached clipping now returns exactly `लीक से हटकर बनाए मोटा मुनाफा`; 72% character / 93% selection confidence; one confirmation click |
| Valid Devanagari marks triggered the noise gate | Matras and viramas were counted as non-headline characters | Included Unicode marks (`\p{M}`) in valid headline text | Exact Hindi blocker is accepted; paragraph contamination remains blocked |
| Halftone grain hallucinated `बनाएं` | Standard second pass produced one extra anusvara | Added a constrained visual-confusable reread, used only for a single low-confidence disagreement | Alternate pass returned `बनाए मोटा`; final headline exactly matches the supplied ground truth |
| Coordinate sliders were too difficult | Users had to calculate Left/Top/Width/Height percentages | Replaced sliders with automatic boxes, draggable/resizable selection, direct draw, candidate buttons and zoom | Preview screenshot proves the central region is selected without coordinates |
| Blurry OCR passed at 68% | Garbage prefix was accepted | Raised competition-safe threshold from 45% to 75% | Exact OCR failure message shown |
| Stale headline survived failed OCR | Default RBI text remained confirmable after a failed scan | Clear the field when a valid new scan begins | Empty headline; confirm and analyse disabled |
| Loading stage too brief to observe | 340 ms prepared-case transition completed before reliable inspection | Two restrained 420 ms stages | Active `Tracing evidence…` and stage list captured |
| RBI evidence link was indirect | Ledger opened the policy archive rather than the precise resolution | Replaced with direct official resolution and precise note | Preview ledger shows direct URL and exact 5.25%/neutral note |
| UNCTAD page blocked verification crawler | Direct evidence audit could not open it | Replaced with accessible World Bank analysis covering detour, time and capacity | Direct page opened and claim match confirmed |
| Cause fragments such as `shipping disruption.` | Claim was not independently understandable | Added occurrence cleanup and Event/Cause/Consequence/Causal hypothesis categories | `A shipping disruption occurred.` plus five unseen-headline tests passed |
| Curated and live modes could be visually conflated | Custom fallback looked too similar to prepared evidence | Added three exclusive status labels and no-substitution wording | Public HTML contains all three labels; unseen production result shows unavailable |
| Multiple-headline pages had no usable selection step | Full-page OCR mixed mastheads and several stories | Added automatic candidate regions plus `Read drawn selection`; dense four-line results, low character confidence and oversized regions are rejected | Blocker passed automatically; other difficult genuine pages fail safely instead of being analysed |
| Zero-source retrieval rendered an analysis shell | Empty sections could look like a successful explanation | Added one compact retrieval-failure state and mutually exclusive status badge | Exact Hindi live attempt rendered one failure card, zero causal maps and zero Stress Tests |
| Long OCR could dominate the result | Corrupted headline text overflowed the editorial hierarchy | Added responsive type classes, wrapping and a bounded scroll region | 522-character body text is blocked before analysis; result heading never overflows its panel |
| Scanner and demos sat too low for projection | Critical interaction required more initial scrolling | Reduced hero height; added live Lens and prepared-demo controls above fold | Official 1200 × 750 production render shows the input dock beginning above the fold |
| Crop action overflowed its panel | `Read selected region` extended beyond the two-column control area | Tightened responsive crop grid and action sizing | Current CSS no longer overflows at tested desktop width |

## Visual-design verification

The old orbit/core hero, serif editorial headline, model/proof navigation and decorative three-dimensional focal object were replaced. The new preview contains:

- a deep midnight navy base with restrained cyan/violet atmospheric glow and subtle grid/grain texture;
- a glass navigation bar, headline dock, buttons and floating evidence inspector;
- near-opaque evidence, claim, Stress Test, ledger and limitation surfaces;
- Sora headings, Inter body copy and Noto Sans Devanagari fallback;
- a large spatial causal map with depth, connecting paths, evidence stamps and selected-node state;
- a right-side evidence inspector on desktop and clean vertical stacking at mobile width;
- Emerald/Confirmed, Cyan/Context, Amber/Conflicting, Violet/Hypothesis and Red/Unsupported states using both colour and text;
- restrained 180–250 ms transitions, except the deliberate 420 ms demo pipeline stages needed for readable progress;
- no decorative 3D object and no constant floating/parallax movement.

The gap-closure checkpoint additionally:

- moves the scanner/input dock into the first 750 px of the desktop production render;
- adds a primary `TRY THE LIVE LENS` action and three one-click prepared-demo buttons;
- reduces hero whitespace without returning to the old design;
- enlarges map labels and evidence-inspector text for projection;
- numbers causal nodes visibly and adds clearer directional arrow glyphs;
- expands the desktop evidence inspector to 400 px;
- keeps long evidence and Stress Test content on near-opaque surfaces; and
- replaces the crop-control grid with a large visual workbench, draggable/resizable selection, three suggested regions and zoom without horizontal overflow.

Contrast and overflow checks:

```json
{
  "desktop": {
    "htmlClientWidth": 1348,
    "htmlScrollWidth": 1348,
    "headingContrast": "18.36:1",
    "leadContrast": "9.81:1"
  },
  "mobile": {
    "clientWidth": 375,
    "scrollWidth": 375,
    "mapWidth": 355,
    "inspectorWidth": 355
  }
}
```

## Automated verification

Command: `npm run verify:competition`

```text
Lint: passed
TypeScript: passed
Production Vinext build: passed
Automated tests: 13 passed, 0 failed
Artifact validation: ESM Worker default.fetch and hosting manifest present
```

Assertions cover:

- English/Hindi/Marathi detection;
- event/cause/causal-link decomposition;
- five unseen grammatical-cleanup cases with Event, Cause, Consequence and Causal hypothesis labels;
- prevention of live title metadata being upgraded to support;
- exact insufficient-evidence copy;
- ranking of the attached page's central large Hindi region over article text;
- layout/detail token merging without body-text import;
- paragraph/body rejection and valid Devanagari combining marks;
- constrained low-confidence visual-confusable selection;
- complete rendered competition result surface;
- empty retrieval-query rejection;
- transparent failure of the unconfigured optional AI route.

Command: `npm audit --omit=dev --audit-level=low`

```text
found 0 vulnerabilities
```

## Remaining limitations

1. **Live evidence retrieval is FAIL / BLOCKED in preview and public production.** Google News RSS and GDELT both timed out from the Sites server on the unseen-headline test. No live source was returned or cited.
2. A fresh unauthenticated production-browser click-through could not be automated because the Sites interaction browser is preview-only. Public HTTP and production-renderer tests passed; physical-browser interaction remains unconfirmed.
3. A physical phone camera was unavailable. The actual `capture="environment"` input opened and returned a test image successfully, but lighting, focus, permissions and device-browser behavior still need the physical-device rehearsal in `PHYSICAL_DEVICE_TEST_CHECKLIST.md`.
4. The supplied Hindi Economic Times regression clipping is now reliable and passes automatically, but arbitrary full-page Hindi and Marathi layouts are not reliable enough for automatic acceptance. Nine of ten genuine-image matrix cases still required selection/correction or failed safely.
5. Hindi and Marathi full-result translation is not complete. Prepared short frames are visibly labelled machine-translated and require fluent human review.
6. Satire, opinion and stale-claim classifiers are not implemented. These inputs are handled conservatively as unverified; the app does not pretend to identify their genre.
7. If live provider results become available, they still use source-title metadata only. That metadata is limited to context or insufficient evidence; it cannot substantiate supporting or contradicting roles without article-body analysis.
8. Responsive behavior passed at a 375 px inner preview viewport. A final 360/390/430 px physical-device check remains prudent.

## Honest final status

MacroLens is ready for a reliable prepared-case competition demonstration and for the exact Hindi clipping demonstration. It is **not** a completed arbitrary live-news verification system or an arbitrary full-page newspaper OCR system. The primary unresolved competition-critical gap is production live retrieval, followed by physical-device validation and wider Hindi/Marathi layout accuracy.

## Physical-device status

`PHYSICAL_DEVICE_TEST_CHECKLIST.md` contains twelve manual checks for camera permission, rear-camera selection, capture, OCR cold-start time, Hindi, Marathi, mobile scrolling, touch targets, source links, weak Wi-Fi, mobile hotspot and camera denial. Every row remains `Awaiting`; no physical-device pass is claimed in this report.

## No-paid-resources audit

No paid resource was introduced. The production path uses exact-version open-source packages and public evidence/retrieval endpoints. Self-hosted Inter, Sora and Noto Sans Devanagari are OFL-licensed. Tesseract.js is Apache-2.0. Next.js and React are MIT. No paid API key is configured. The optional Gemini route remains unavailable and is not required by any prepared demo.

See `COMPETITION_DISCLOSURE.md` for the complete AI and resource disclosure.
