# MacroLens Priority 1 Regression Test Report V2

**Test date:** 2026-08-23 (UTC)  
**Application:** MacroLens — HKU AI+ Challenge competition MVP  
**Preview build tested:** `e30e19b` (`Make OCR language selection race-safe`)  
**Headline-detection implementation commit:** `9d3a94b` (`Fix automatic newspaper headline detection`)  
**Public Site:** <https://macrolens-ripple-intelligence.krishiv-r.chatgpt.site>  
**Testing surface:** fresh agent preview browser session; the public Site was not used as a substitute for this browser run  
**Input asset:** `test 1- macrolens.jpg`  
**Input SHA-256:** `f5590aba3735039866912aa2b479f39e33ab466138c25e47d7c2c4c4a1ed29fd`

## Executive status

The automatic two-stage newspaper OCR work **is implemented**. T26 now passes on the supplied Economic Times Hindi full-page image in the actual running preview. The central three-line headline region is automatically selected, the second pass returns the exact expected text, and analysis stays disabled until one confirmation click.

This report does **not** generalise one successful page into universal real-newspaper reliability. The broader 10-image real-world matrix from the baseline still has only one confirmed automatic pass and nine cases requiring manual selection or further verification. Arbitrary live evidence retrieval also remains unavailable when the public feeds return no usable sources.

## Exact implementation files changed

Commit `9d3a94b` changed the OCR interface and processing pipeline:

| File | Change |
| --- | --- |
| `app/lib/documentImage.ts` | Added margin removal, grayscale/contrast treatment, adaptive thresholding, skew estimation/correction, document preparation and crop-canvas utilities. |
| `app/lib/headlineOcr.ts` | Added bounding-box candidate generation, headline ranking, region/line grouping, second-pass text merging, OCR cleanup and the body-text validation gate. |
| `app/page.tsx` | Added the two-stage Tesseract pipeline, candidate overlay, draggable/resizable crop rectangle, candidate buttons, zoom controls, separate confidence values, confirmation gate and compact no-evidence result. |
| `app/globals.css` | Added the crop workbench, region overlays, handles, candidate strip, confidence row and compact failure-state styling. |
| `app/lib/analysis.ts` | Corrected live/metadata/unavailable wording and unsupported-analysis boundaries. |
| `tests/analysis-logic.test.ts` | Added candidate ranking, Devanagari validation, body-text rejection and OCR-merge regressions. |
| `tests/rendered-html.test.mjs` | Added rendered-surface checks for the OCR disclosure and result labels. |

Commit `e30e19b` additionally changed `app/page.tsx` after a repeat run exposed a language-selection race: selecting Hindi and immediately uploading could start the worker with the previous English state. A synchronously updated `ocrLanguageRef` now supplies both OCR stages and candidate ranking.

## Git diff proof

```text
$ git show --stat --oneline 9d3a94b
9d3a94b Fix automatic newspaper headline detection
 app/globals.css              |  88 +++++++---
 app/lib/analysis.ts          |   4 +-
 app/lib/documentImage.ts     | 256 +++++++++++++++++++++++++++
 app/lib/headlineOcr.ts       | 273 +++++++++++++++++++++++++++++
 app/page.tsx                 | 400 ++++++++++++++++++++++++++++++++++---------
 tests/analysis-logic.test.ts |  43 +++++
 tests/rendered-html.test.mjs |   3 +
 7 files changed, 963 insertions(+), 104 deletions(-)

$ git show --stat --oneline e30e19b
e30e19b Make OCR language selection race-safe
 app/page.tsx | 21 ++++++++++++++++-----
 1 file changed, 16 insertions(+), 5 deletions(-)
```

Key race-fix hunk executed in the final retest:

```diff
+ const ocrLanguageRef = useRef<ExplanationLanguage>("English");

- worker = await createWorker(ocrCode[ocrLanguage], undefined, {
+ const activeOcrLanguage = ocrLanguageRef.current;
+ worker = await createWorker(ocrCode[activeOcrLanguage], undefined, {

- const candidates = buildHeadlineCandidates(lines, prepared.width, prepared.height, ocrLanguage);
+ const candidates = buildHeadlineCandidates(lines, prepared.width, prepared.height, activeOcrLanguage);

- onChange={(event) => setOcrLanguage(event.target.value as ExplanationLanguage)}
+ onChange={(event) => {
+   const language = event.target.value as ExplanationLanguage;
+   ocrLanguageRef.current = language;
+   setOcrLanguage(language);
+ }}
```

The complete diff is reproducible from the repository with:

```sh
git diff 57b1e3b..e30e19b -- app/page.tsx app/lib/documentImage.ts app/lib/headlineOcr.ts app/globals.css app/lib/analysis.ts tests/analysis-logic.test.ts tests/rendered-html.test.mjs
```

## T26: Real Hindi full-page newspaper headline detection

**Expected headline:** `लीक से हटकर बनाए मोटा मुनाफा`

| Image | Expected headline | Automatic candidate | Final OCR | User actions required | Time | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Supplied Economic Times (Hindi) full page, multiple columns and surrounding body text | `लीक से हटकर बनाए मोटा मुनाफा` | Central, largest three-line region; candidate 01; 93% headline-selection confidence | `लीक से हटकर बनाए मोटा मुनाफा` | 1 confirmation click after upload; no candidate switch, crop adjustment or coordinate entry | 20.8 seconds end-to-end to the observed completed state | **PASS** |

### Mandatory recorded fields

| Field | Actual preview output |
| --- | --- |
| Automatically detected headline region | `left 20.9564%; top 1.74869%; width 42.365%; height 46.266%` of the prepared page |
| Selected region composition | Three aligned central line regions; surrounding left and right body columns excluded |
| Exact OCR output | `लीक से हटकर बनाए मोटा मुनाफा` |
| Headline-selection confidence | **93%** |
| OCR character confidence | **72%** |
| User actions after upload | **1** — click `Confirm headline` |
| Processing time | **20.8 seconds** from accepted upload to the first observed completed status; polling resolution 2.5 seconds |
| Body text rejected | **Yes.** Candidate ranking did not select surrounding paragraphs; final text is 28 characters with no body contamination. The body-text safeguard remained active for implausible selections. |
| Analysis blocked until confirmation | **Yes.** `Analyse headline` was disabled before confirmation and enabled after one confirmation click. |
| Crop coordinate sliders | **0** `input[type=range]` elements; replaced by a draggable/resizable rectangle, four corner handles, three candidate buttons and zoom controls |
| Final status | **PASS for this supplied real page** |

### Exact browser interaction output

Before confirmation:

```json
{
  "status": "Primary headline candidate extracted. Check the text, then confirm once before analysis.",
  "headline": "लीक से हटकर बनाए मोटा मुनाफा",
  "confidence": "CHARACTER CONFIDENCE\n72%\nHEADLINE-SELECTION CONFIDENCE\n93%",
  "candidateBoxes": 3,
  "cropSelection": 1,
  "sliders": 0,
  "analyseEnabledBeforeConfirm": false
}
```

After the single confirmation click:

```json
{
  "status": "Headline confirmed. Ready to analyse.",
  "headline": "लीक से हटकर बनाए मोटा मुनाफा",
  "analyseEnabled": true
}
```

After evidence retrieval returned zero usable sources:

```json
{
  "modeBadges": ["LIVE RETRIEVAL UNAVAILABLE"],
  "sourceLanguage": "Hindi",
  "explanationLanguage": "English",
  "machineTranslation": "not human-verified",
  "failureCount": 1,
  "causalMapCount": 0,
  "stressTestCount": 0
}
```

The visible compact failure copy was:

> No evidence-backed analysis was generated. The public source feeds returned zero usable results. MacroLens has not created a causal map, winners, losers or a Stress Test from unsupported commentary.

## Failure found during V2 testing and retest

The first clean V2 run passed. A timed repeat then produced `Fld ECE` at 29% character confidence and was blocked by the body/noise safeguard. Investigation showed that a Hindi selection followed by an immediate upload could race React's asynchronous state update and construct an English Tesseract worker.

Fix completed in `e30e19b`:

- the language selector synchronously updates `ocrLanguageRef`;
- Stage 1 worker creation reads the ref;
- candidate ranking uses the same captured language;
- Stage 2 and the Devanagari confusable pass use that same language.

The same full-page image was then rerun from a fresh tab using the normal flow (`Upload or scan` → `Hindi` → upload). It returned the exact expected headline, 72% character confidence and 93% selection confidence. The one-click confirmation gate and zero-source failure boundary both passed.

## Screenshot proof

1. **Uploaded full page and detected headline boxes:** [macrolens-v2-t26-postfix-boxes.jpg](sandbox:/workspace/scratch/macrolens-v2-t26-postfix-boxes.jpg)  
   SHA-256 `ab54394d6aef988fa8f509f3e04d6d2aaf0aa274d15f26a8e5db25fd09c6336d`
2. **Selected central headline region, exact OCR text, candidate boxes, resize handles and zoom controls:** [macrolens-v2-t26-postfix-controls.jpg](sandbox:/workspace/scratch/macrolens-v2-t26-postfix-controls.jpg)  
   SHA-256 `bd0777a9ff7d5c814a0d55541a2255ad37d6c6a804d9c18089dc600f03e988c5`
3. **Separate confidence values, one-click confirmation gate and disabled analysis control; no coordinate sliders:** [macrolens-v2-t26-postfix-confirmation.jpg](sandbox:/workspace/scratch/macrolens-v2-t26-postfix-confirmation.jpg)  
   SHA-256 `df7d3fd957a5e60939b12a8d3b4752f4c3be299ec78871a74a1937bb373d2e2e`
4. **Corrected compact zero-source result layout:** [macrolens-v2-t26-postfix-results.jpg](sandbox:/workspace/scratch/macrolens-v2-t26-postfix-results.jpg)  
   SHA-256 `eab1b582317efd35d5e6b6d0a823238a912b64d159bdfa0294d4b12daf504968`

## Automated verification output

Command: `npm run verify:competition`

```text
lint: PASS
typecheck: PASS
production build: PASS
artifact validation: PASS
tests: 13
pass: 13
fail: 0

PASS ranks the central large Hindi region above surrounding article text
PASS combines layout anchors with a detailed OCR token without importing body text
PASS blocks paragraph-like OCR before analysis
PASS headline validation accepts Devanagari combining marks
PASS uses a constrained visual pass for one low-confidence halftone mark
PASS renders the complete competition result surface
```

## Corrected OCR status matrix

| Capability | Status | Evidence boundary |
| --- | --- | --- |
| Hindi clean fixture OCR | **PASS** | Controlled fixture coverage only |
| Hindi real-newspaper headline detection — supplied Economic Times page | **PASS** | T26 exact-output browser pass after race fix |
| Hindi real-newspaper OCR across arbitrary pages | **PARTIALLY VERIFIED** | One full-page pass does not establish broad reliability |
| English real-newspaper automatic headline detection | **NOT YET VERIFIED IN V2** | No new genuine image was supplied or rerun in this V2 task |
| Marathi real-newspaper automatic headline detection | **NOT YET VERIFIED IN V2** | No new genuine image was supplied or rerun in this V2 task |
| Crop rectangle, resize handles, candidate selection and zoom | **PASS** | Browser screenshot and DOM counts |
| Long/body-text analysis gate | **PASS** | Analysis disabled for implausible extraction; zero slider controls |
| Arbitrary live evidence retrieval | **BLOCKED / NOT PASSED** | T26 returned zero usable sources; no causal analysis was generated |

## Remaining limitations

- T26 proves the supplied Economic Times page, not all Hindi newspaper layouts.
- The broader real-image suite still needs owner-supplied/licensed English, Hindi and Marathi pages for repeatable regression coverage.
- OCR confidence is Tesseract character confidence, not semantic correctness.
- Headline-selection confidence is a deterministic layout-ranking score, not a probability of truth.
- Cold-start time depends on device, browser caching and trained-language asset availability; physical-phone timing remains awaiting manual confirmation.
- Live retrieval is not marked passed. When no usable sources are returned, MacroLens correctly shows `LIVE RETRIEVAL UNAVAILABLE` and suppresses the causal map, relevance, winners/losers and Stress Test.
- Camera permission and rear-camera capture still require a physical-device run.

## Paid-resource audit

No dependency was added by the V2 language-race fix. The OCR implementation continues to use the existing open-source Tesseract.js pipeline and free font packages. No paid API, dataset, image, font or production dependency was introduced by these changes.

## Honest final status

**T26 is PASS for the supplied real Hindi full-page newspaper image. Priority 1 as a whole is not fully complete because arbitrary live evidence retrieval and broad real-newspaper OCR coverage remain unverified or blocked.**
