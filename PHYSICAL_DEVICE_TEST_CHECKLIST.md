# MacroLens Physical-Device Rehearsal

Run this checklist on the same phone and network planned for the HKU AI+ Challenge. Do not convert an `Awaiting` row to `Pass` unless the action succeeds on the physical device.

## Test record

| Field | Record |
|---|---|
| Tester | ______________________________ |
| Date and time | ______________________________ |
| Phone model | ______________________________ |
| OS version | ______________________________ |
| Browser and version | ______________________________ |
| Production URL | `https://macrolens-ripple-intelligence.krishiv-r.chatgpt.site` |

## Manual checks

| ID | Check | Exact action and expected result | Result: Pass / Fail / Blocked | Actual time / output | Notes or bug details |
|---|---|---|---|---|---|
| P01 | Camera permission | Tap **TRY THE LIVE LENS**, choose **Open camera**, allow camera access. No permission loop or blank screen. | Awaiting | __________________ | __________________ |
| P02 | Rear camera | Confirm the rear camera opens by default and the capture frame is usable in portrait orientation. | Awaiting | __________________ | __________________ |
| P03 | Image capture | Photograph one printed headline. The captured image returns to MacroLens and a preview appears. | Awaiting | __________________ | __________________ |
| P04 | OCR cold start | After a fresh browser launch, scan an English headline. Record time from selection to OCR result. Target: under 15 seconds on the competition phone. | Awaiting | ______ seconds | __________________ |
| P05 | Hindi OCR | Select **Hindi**, photograph a clear Hindi headline, crop to one headline, run **Read selected region**, correct the draft, and confirm it. | Awaiting | ______ seconds | Extracted: __________________ |
| P06 | Marathi OCR | Select **Marathi**, photograph a clear Marathi headline, crop to one headline, run **Read selected region**, correct the draft, and confirm it. | Awaiting | ______ seconds | Extracted: __________________ |
| P07 | Mobile scrolling | Analyse prepared case 01. Scroll from the summary through map, evidence, relevance, Stress Test, ledger and limitations. No trapped scroll or sideways movement. | Awaiting | __________________ | __________________ |
| P08 | Touch targets | Tap tabs, crop sliders, demo buttons, causal nodes, evidence sources and Retry without accidental neighbouring activation. | Awaiting | __________________ | Smallest difficult target: __________ |
| P09 | Source links | Open at least one official and one independent source. Each opens in a new tab and the Back action returns to MacroLens without losing the result. | Awaiting | __________________ | URLs opened: __________________ |
| P10 | Weak Wi-Fi | Use weak Wi-Fi and run an unseen headline. Loading remains understandable; failure must show **LIVE RETRIEVAL UNAVAILABLE**, never a blank or curated-looking result. | Awaiting | ______ seconds | __________________ |
| P11 | Mobile hotspot | Repeat prepared demo 01 and one custom headline over a phone hotspot. Record whether OCR and source links still work. | Awaiting | ______ seconds | __________________ |
| P12 | Camera denial | Deny camera permission once. Confirm MacroLens remains usable through **Upload image** and typed input. | Awaiting | __________________ | __________________ |

## Competition go/no-go

| Gate | Decision |
|---|---|
| Camera, upload and prepared case 01 all pass | GO / NO-GO |
| Hindi and Marathi can be corrected and confirmed | GO / NO-GO |
| No horizontal overflow or trapped scrolling | GO / NO-GO |
| Source links open on the presentation network | GO / NO-GO |
| Live retrieval result is honestly labelled | GO / NO-GO |

**Tester sign-off:** ______________________________  
**Blocking bugs before competition:** ________________________________________________________________
