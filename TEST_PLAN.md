# MacroLens competition test plan

Last updated: 22 August 2026

## Automated checks

| Check | Status | Evidence |
|---|---|---|
| Production build | Passed | `npm test` completes the bounded Vinext build |
| Server-rendered result structure | Passed | Automated assertions cover curated label, claims, map, Stress Test, ledger and limitations |
| Empty retrieval input | Passed | API returns HTTP 400 and no articles |
| Missing optional AI key | Passed | API returns HTTP 503 with a transparent “not configured” reason |
| English/Hindi/Marathi detection | Passed | Pure-logic tests cover representative typed headlines |
| Causal claim decomposition | Passed | Event, cause and implied causal link are separated |
| Live evidence-role safeguard | Passed | Title metadata cannot be upgraded to “Supports” |
| Insufficient-evidence copy | Passed | Exact safeguard sentence is asserted |
| TypeScript | Passed | `npm run typecheck` |
| ESLint | Passed | `npm run lint` |
| Production dependency vulnerabilities | Passed | `npm audit --omit=dev`: zero known vulnerabilities on 22 August 2026 |

## Scenario matrix

| Scenario | Implementation status | Required manual check before deployment |
|---|---|---|
| Typed English headline | Passed in preview | Custom retrieval failed safely with Low confidence and an empty ledger |
| Typed Hindi headline | Passed in preview | Detected Hindi and produced the conservative fallback |
| Typed Marathi headline | Passed in preview | Detected Marathi and produced the conservative fallback |
| Clear newspaper image | Passed in preview | English, Hindi and Marathi OCR fixtures all extracted readable text; physical-device photography remains untested |
| Blurry image | Passed after fix | A 68% garbage extraction exposed the issue; the final 75% gate now clears stale text and blocks analysis |
| OCR correction | Passed in preview | Analysis was blocked until “Use corrected text” was selected |
| Misleading causal headline | Supported conservatively | Ensure causal connector becomes a hypothesis, not fact |
| Opinion headline | Partial | Live mode stays unverified; dedicated opinion classifier is not implemented |
| Satirical headline | Partial | Live mode stays unverified; dedicated satire classifier is not implemented |
| Unsupported claim | Supported | Exact insufficient-evidence message appears |
| Outdated claim | Partial | Source dates are visible; automated stale-claim classification is not implemented |
| Conflicting sources | Curated support | AI energy case contains explicit contradictory/counter-context evidence |
| Weak internet | Supported | Retrieval failure produces fallback with Retry and curated demos |
| Retrieval failure | Supported | No blank result; no invented evidence |
| Mobile display | Passed at a 375 px inner viewport | No horizontal overflow; physical 360 px and 430 px device checks remain |
| Broken source link | Links checked 22 Aug 2026 | Recheck immediately before presentation |
| Insufficient evidence | Supported | Exact safeguard copy and empty ledger state implemented |

## Demo rehearsal

1. Load the site before the pitch and select **01 RBI rate decision**.
2. Select **Analyse headline**.
3. Show the claim cards, then click the map’s “Inflation composition matters” node.
4. Open its linked evidence in the inspector.
5. Scroll to **Stress Test**, then the confidence explanation.
6. State clearly: “This is a pre-verified demo case, not live retrieval.”
7. Target: complete this interaction in 35–45 seconds without relying on the external retrieval service.

## Release blockers

- Live headline retrieval was unavailable from the hosted agent preview; only its transparent failure path was verified there.
- Physical-phone camera/OCR testing still requires a real device; the `capture="environment"` input and file-return path passed in preview.
- Hindi and Marathi translations require fluent human review.
- Deployment should occur only after `MACROLENS_TEST_REPORT.md` and the stable checkpoint are reviewed.
