---
target: Evidentory dashboard
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/mnt/user-data/uploads/evidentory/src/app/dashboard/page.js"
target_fingerprint: "sha256:834b1ece50b251efa9ae8e0cd8fb2830565a4bb4396582186f8af296e199a115"
target_path: /mnt/user-data/uploads/evidentory/src/app/dashboard/page.js
timestamp: 2026-11-18T08-38-59Z
slug: src-app-dashboard-page-js
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent). Source-only run: the app could not be started, so no browser screenshots or overlay.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Prijem, Rezervacija, Otkaži and Uredi close silently with no confirmation; submit buttons show no saving state; pagination is fake |
| 2 | Match System / Real World | 3 | Domain terms are right; raw codes ("OTKAZANA REZERVACIJA"), English "Audit Trail Log", "Ukupno artikala" counts units, not items |
| 3 | User Control and Freedom | 2 | No Esc/backdrop close, no undo; edit-modal article switcher discards unsaved changes |
| 4 | Consistency and Standards | 1 | Four primary-button colours; alert() mixed with modals; Odustani/Otkaži/Zatvori; ekavian and ijekavian mixed |
| 5 | Error Prevention | 2 | Double-submit possible; "Mimo rezervacije" checks total stock, not free stock; free-text category |
| 6 | Recognition Rather Than Recall | 2 | Otkaži rezervaciju lists every customer, not the ones holding a reservation; no reservations list |
| 7 | Flexibility and Efficiency | 2 | Scan entry on Prijem is great, but none on Otpremnica; search ignores PLU; history has no filters |
| 8 | Aesthetic and Minimalist Design | 2 | Clean cards, but pulsing dot on every row, hover states on non-clickable KPIs, dead pagination, emoji icons |
| 9 | Error Recovery | 2 | Stock messages give exact numbers (excellent), but raw error.message leaks and several writes ignore errors |
| 10 | Help and Documentation | 1 | Almost none; "Po / Mimo rezervacije" unexplained |
| **Total** | | **19/40** | **Poor** |

## Design Specificity Verdict

**LLM assessment:** The business logic is written for this company: PLU/Šifra-first table, scan-to-add (+1 on rescan), reservation chips per item, "Po / Mimo rezervacije" per dispatch line, a letterheaded otpremnica PDF. But it sits inside a stock Tailwind admin shell (navy #0F172A sidebar, white rounded-2xl cards, row of 4 KPI cards, blue-600 accent, generic cube icon) that could hold any SaaS app. Montora's own navy + red only appear in the PDF, never in the app. The KPIs aren't things anyone acts on: two are timestamps, none show low stock, reserved totals or today's dispatches.

**Deterministic scan:** `impeccable detect` on dashboard/page.js, page.js, layout.js: 0 findings. Not a clean bill of health: on .js files the detector runs regex rules only; contrast and text-size rules need a running page. The design review's contrast concerns (text-slate-400 on white, about 2.6:1, at 10-12px) went unchecked by the detector.

**Visual overlays:** not available. The app couldn't run here, so nothing was injected into a browser.

## Overall Impression

The domain thinking is good and the hard parts (reservations, scanning, delivery notes) are all there. What lets it down is integrity, not looks: bookings can double-post, several actions fail or succeed silently, and the most frequent job (dispatch) is a 12px sidebar link while the canvas opens on four numbers. Biggest opportunity: make every stock movement safe and confirmed, then give dispatch/receiving a home on the main canvas.

## What's Working

1. **Domain-native accelerators.** Scan or type a code and press Enter on Prijem; rescans add 1. Selects show live stock and free quantity inline.
2. **Reservations visible in context.** Amber chips with client names under each item; the dispatch modal asks about reservations only when the item has some.
3. **Validation that explains itself.** "Na stanju imate ukupno X, od čega je već Y rezervisano. Slobodno: Z." The log-deletion dialog offers "Vrati količinu na zalihe", on by default for dispatches.

## Priority Issues

**[P0] Booking can corrupt stock data**
- **Why it matters:** in an inventory tool the stock figures are the product. A double-click on "Knjiži i generiši otpremnicu" deducts stock twice and makes two PDFs.
- **Details:** no submit button disables while saving; each line is a separate update + insert in a client loop with no transaction; a new customer is inserted before stock is validated (failed dispatch still creates them, retry duplicates them); "Mimo rezervacije" checks `kolicina` not free stock (line ~554), so another client's reserved goods can be dispatched; delivery-note number is computed client-side, so two users can get the same one.
- **Fix:** disable + "Knjiženje…" while saving; move each booking into one Supabase RPC (transaction) that also issues the document number; validate before any insert; warn when "Mimo" exceeds free stock.
- **Suggested command:** /impeccable harden

**[P1] Silent outcomes and controls that do nothing**
- **Why it matters:** the user finds out an edit failed only when the stock count is wrong.
- **Details:** no success feedback after Prijem/Rezervacija/Otkaži/Uredi; pagination is decorative (one hard-coded "1", buttons with no handler); partner update writes `fontGradi` (typo, line 291) so the city never saves; partner and log deletes ignore errors; full history reset shows "Uspješno očišćeno" over a table that still shows old data (no refetch); read-only users get a dead "Uredi" click; empty search shows a bare table header.
- **Fix:** a toast with aria-live ("Primljeno 12 kom od …"); remove or implement pagination; check every `error`; hide Uredi for read-only; empty states with a next step ("Nema artikala za 'xyz' · Očisti pretragu").
- **Suggested command:** /impeccable harden, then /impeccable clarify

**[P1] Information architecture: actions live in the navigation, reservations have no home**
- **Why it matters:** dispatch and receiving are the core jobs but have no place on the canvas; reservations, the hardest thing to keep track of, have no list.
- **Details:** Prijem/Otpremnica/Rezervacije sit in the sidebar styled like category links; "Rezervacije" opens a create form, not a list; "Statistika i Promet" has no statistics; history can't be filtered or searched by document number or customer.
- **Fix:** primary action bar on the main panel ("Nova otpremnica" primary, "Prijem" secondary); sidebar = navigation only (Zalihe, Rezervacije list with Otkaži per row, Promet with filters, Komitenti, Admin); KPIs that drive action (free vs reserved, items at zero, today's movements).
- **Suggested command:** /impeccable layout (with /impeccable shape for the reservations view)

**[P2] Accessibility**
- **Why it matters:** low-contrast small labels are hard to read for everyone in a warehouse setting, and keyboard/screen-reader users can't complete a booking reliably.
- **Details:** text-slate-400 on white (about 2.6:1) for table headers, KPI labels, Šifra column at 10-12px; slate-500 on the navy sidebar at 11px; no `<label htmlFor>` anywhere; many inputs have no focus style; "⋮", "✕" and logout have no aria-label; modals have no dialog role, focus trap or Esc; row menu likely clipped by an overflow-hidden card on the last rows.
- **Fix:** slate-600+ text, 12px minimum, real labels, focus-visible rings, one shared Modal component with dialog semantics.
- **Suggested command:** /impeccable audit, then /impeccable harden

**[P2] No visual or copy system**
- **Why it matters:** inconsistency makes the tool feel unfinished and makes every screen re-learnable.
- **Details:** four primary-button colours (slate-900, amber, blue, slate-800); alert() mixed with modals; ekavian/ijekavian mixed even inside one message ("Uspješno očišćeno" … "uspešno vraćena"); "5 komad"; English leaks ("Username", "Read-only", "Audit Trail Log"); emoji as icons; the PDF strips č/ć/š/ž/đ from customer names on a legal document.
- **Fix:** choose ijekavian, write a short terms list (Odustani for cancel, Obriši for delete), one button scale, embed a Unicode font in jsPDF, bring Montora navy + red in as tokens.
- **Suggested command:** /impeccable polish, plus /impeccable clarify and /impeccable typeset

## Persona Red Flags

**Alex (power user, dispatching 6 items):** clicks the second sidebar verb, with no shortcut. Finds no scan field, unlike Prijem, so scrolls a native select of the whole catalogue six times. Line 1 comes prefilled with whatever item is first. Retypes "Otpremnicu predao/la" though the logged-in user is known. Can't close with Esc. No "Nova otpremnica" afterwards. Finding yesterday's note means scrolling the whole unfiltered history. Search can't find by PLU.

**Sam (keyboard / screen reader):** tabs through every category before content (no skip link). "⋮" is announced as just "button". Opening a modal doesn't move focus into it. Fields are unnamed. Success is never announced, while alert() errors are.

**Riley (stress tester):** a double-click makes two documents. Customers "Hotel" and "Hotel Montora" break reservation sums (matching uses `includes`). A "|" in a customer name breaks the parser. A partner's city "saves" but doesn't persist. Deleting a ULAZ log entry leaves stock inflated. With 1,000 items every row renders and every select has 1,000 options.

## Minor Observations

- `animate-fade-in` is used but never defined (globals.css only imports Tailwind).
- `no-scrollbar` hides the scroll cue on lists capped at 200-300px.
- Toolbar category select is unsorted; the sidebar list is sorted.
- PLU is required on create, optional on edit; a blank PLU saves as 0.
- Delivery-note number format changes during the day (DDMM/YYYY, then DDMM_2_YYYY).
- Fixed 260px sidebar with no collapse crushes the main panel below about 768px.
- Login background is gray (#f3f4f6) while the app uses slate.

## Questions to Consider

- If dispatch is the job, why is "Otpremnica" a 12px sidebar link and the canvas four numbers nobody acts on?
- Should a reservation be a real record (own list, owner, expiry) instead of something rebuilt from free-text comments?
- Can a log that one red button empties be called an audit trail? Would reversal entries (storno) be more honest than deletion?
