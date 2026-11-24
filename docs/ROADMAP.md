# Roadmap

**How to use this:** every task fits in **one chat**. Open a new Claude Code session on this repo and paste:

> Do task **B03** from `docs/ROADMAP.md`.

The chat reads `docs/`, does the work, ticks the box, and opens a pull request. Tasks marked ⇉ can run in parallel chats. "Needs" lists the tasks that must be done first.

---

## Stage A: First exercise on your phone

- [ ] **B01 Scaffold.** Svelte + Vite + TS, KaTeX, always-dark theme, test runner, works in Chrome, Firefox, Edge and Safari. One hard-coded problem on screen.
- [ ] **B02 Content schema.** JSON Schema + TS types for book → chapter → unit → reading cards / exercises / proof cards (SPEC §4). Write `docs/CONTENT_GUIDE.md`, which every K-task chat follows. *Needs:* B01.
- [ ] **B03 OpenStax importer.** ⇉ `scripts/import_openstax.py`: source files → JSON for all 110 sections. Converts the math markup to LaTeX, copies figures, attaches book answers, marks each exercise as auto-checkable or self-check, and keeps worked examples for the readings. *Done when:* all 110 unit files exist and spot-checks render correctly. *Needs:* B02.
- [ ] **B04 Answer checker.** ⇉ `src/check/`: plain-text math parsing, random-point equivalence, `+C`, tolerance, intervals/sets, vectors/matrices, DNE/∞, multi-part. 150+ tests. *Needs:* B01.
- [ ] **B05 Validator.** `npm run validate`: schema, KaTeX renders, every stored answer passes the checker, plus `scripts/verify_sympy.py`. *Needs:* B02, B04.
- [ ] **B06 Input mode 1: plain text.** Live preview and a helper key row tuned for the iPhone keyboard. *Needs:* B01.
- [ ] **B07 Input mode 2: visual editor.** MathLive with its on-screen math keyboard, plus a settings toggle between modes 1 and 2. *Needs:* B06.
- [ ] **B08 Card screens.** Reading cards (swipe, "Got it"), exercise card (check → retry → hint → step-by-step solution), self-check card, source and solution labels, desktop keyboard shortcuts. *Needs:* B03, B04, B06.
- [ ] **B09 Deploy.** Cloudflare Pages from the private repo. The chat gives you about 5 minutes of click-by-click setup. *Done when:* it opens on your iPhone and Windows. *Needs:* B08.

**🎯 Milestone A: you can do OpenStax §1.1 on your phone, with both input modes to try out.**

## Stage B: Daily driver

- [ ] **B10 PWA + offline.** Manifest, icons, service worker, iOS "Add to Home Screen" install. Content downloads chapter by chapter. *Needs:* B09.
- [ ] **B11 Progress engine.** IndexedDB attempt log, strict-order "next card" logic, ts-fsrs reviews mixed in between chunks, unit and chapter completion %. *Needs:* B08.
- [ ] **B12 Account + sync.** Cloudflare Worker + D1, email one-time-code login, QR pairing for new devices, attempt-log sync, export/backup button. *Needs:* B11, B09.
- [ ] **B13 Variants.** Templates with random parameters for missed exercises, with the answer computed per variant. *Needs:* B04, B11.

**🎯 Milestone B: phone and computer in sync, works offline, missed problems come back with new numbers.**

## Stage C: Duolingo layer (core feature)

- [ ] **B14 Path map.** Winding path per book, chapter banners, unit nodes with % rings, pulsing current node, tap any finished node to review. *Needs:* B11.
- [ ] **B15 XP, combos, streaks, freezes.** Plus the home screen with a big streak counter and book %. *Needs:* B11.
- [ ] **B16 Celebrations + sound.** Chunk-complete confetti, chapter trophy, book-complete screen, sound toggle. *Needs:* B15.
- [ ] **B17 Crowns + badges.** Mastery 0–5 per unit from spaced-repetition data, plus about 30 badges. *Needs:* B15.
- [ ] **B18 Stats screen.** Activity heatmap, XP per week, personal league, accuracy by topic, projected finish date, % of each book. *Needs:* B15.

**🎯 Milestone C: it feels like Duolingo.**

## Stage D: Content for Calculus I–III (110 chats, ⇉ start any time after B05)

- [ ] **K-V1.1.1 … K-V3.7.4: one chat per section** (see [CURRICULUM.md](CURRICULUM.md)), following CONTENT_GUIDE:
  1. Write the required reading (adapted from the section, with its worked examples).
  2. Turn the book answers into checkable formats.
  3. Write ✅ solutions for exercises without book answers, verified with SymPy, and 🤖 only when verification is impossible.
  4. Add hints and variant templates.
  5. Add optional proof cards.
  6. Make sure the validator passes.

  Tick the unit in CURRICULUM.md when done. Stay at least one chapter ahead of where you're studying.

## Stage E: After calculus (each line is one chat)

- [ ] **U-LA** Map Hefferon *Linear Algebra* into units, and write an importer if its source is available. Then K-tasks per unit.
- [ ] **U-BOP** Map Hammack *Book of Proof* into units. Then K-tasks.
- [ ] **B19 Proof card types.** Reorder-the-proof, fill-the-gap, true/false + counterexample, definition recall. *Needs:* B08. Do this before Stage 3.
- [ ] **B20 Book importer for your copies.** PDF or phone photos → exercises + answers → unit JSON, with a review screen. Test on Spivak ch. 1.
- [ ] **U-SPV** Map Spivak chapters into units. Then **I-S01 … I-S30** (import) and K-tasks.
- [ ] **U-ABB / U-PMA / U-RCA** Same treatment for Abbott, Rudin PMA and Rudin RCA.

## Suggested order
1. B01 → B02 → (B03 ⇉ B04 ⇉ B06) → B05 → B07 → B08 → B09: **Milestone A**.
2. Start K-V1.1.1, K-V1.1.2, … in parallel chats right away; keep 1–2 chapters ahead of yourself.
3. B10 → B11 → B12 → B13, then B14–B18.
