# Spec sheet (draft v0, to be revised after QUESTIONS.md is answered)

## 1. Product in one sentence
A private, phone-first practice app. It turns your math textbook PDFs into an endless, spaced-repetition stream of problems with solutions, usable in 60-second bursts and synced across devices.

## 2. Hard requirements
1. **Zero setup per session.** Tap the home-screen icon and a problem is on screen in under 2 seconds. No menus first.
2. **Never scroll a PDF.** Each problem shows on its own screen, and the solution is revealed step by step.
3. **Sync** between phone and computer, automatically. Offline works and syncs later.
4. **Problems and solutions come from real books.** Every problem stores its source (book, section, problem number, page).
5. **Volume.** Thousands of problems per subject, with spaced repetition so they don't pile up.
6. **Scales to proofs.** The same app works for Stewart and for Rudin.

## 3. Core loop (the two-minute session)
```
open app → problem card (KaTeX)
        → [work on paper / in head]
        → tap "Answer"  → compare (or type answer → auto-check)
        → tap "Solution" → steps revealed one at a time
        → self-grade ✗ / ~ / ✓   → scheduler picks the next card
        → swipe for the next one; quit anytime, nothing lost
```

## 4. Card types
| Type | Best for | Phone-friendly? |
|---|---|---|
| Compute → reveal → self-grade | Most calculus and linear algebra | ✅✅ |
| Compute → type answer → auto-check | Numeric and short symbolic answers | ✅ (needs a math keyboard) |
| Multiple choice / "which method?" | Picking the right technique (e.g. which integration method?) | ✅✅ |
| Definition / theorem recall | Every phase, especially Rudin | ✅✅ |
| Proof reorder (shuffled proof steps) | Phases 0, 4, 5, 7 | ✅✅ |
| Proof fill-in-the-gap | Phases 4, 5, 7 | ✅ |
| True/false + counterexample | Analysis | ✅✅ |
| Full proof write-up → AI critique | Rudin exercises | Computer or photo of paper |
| Photo of handwritten work → AI feedback | Long computations | ✅ |

## 5. Architecture (proposed)

```
 ┌───────────── Ingestion (runs on your computer or in a cloud session) ─────────────┐
 │ PDF → page images → Claude vision → JSON problems/solutions → validator → review UI │
 │                              ↘ SymPy check for computational answers               │
 └──────────────────────────────────────────┬─────────────────────────────────────────┘
                                            ▼
                         Database (Supabase Postgres + storage for figures)
                                            ▲
 ┌──────────────────────────────────────────┴─────────────────────────────────────────┐
 │  PWA (installable on phone and desktop): KaTeX, offline cache, FSRS scheduler       │
 │  optional server functions: answer checking (SymPy), AI hints and grading (Claude)  │
 └─────────────────────────────────────────────────────────────────────────────────────┘
```

Default stack (to confirm):
- **Frontend:** SvelteKit or Next.js as a PWA, KaTeX for rendering, MathLive for math input.
- **Backend:** Supabase (auth, Postgres, storage, edge functions). Free tier is enough for one user.
- **Hosting:** Vercel or Cloudflare Pages, so it's just a URL with no app store.
- **Ingestion:** Python scripts using PyMuPDF (PDF to images) and the Claude API (vision extraction, structured output).
- **Scheduler:** FSRS (open-source spaced repetition algorithm, used by Anki).

Alternative with almost nothing to build: export the cards to **Anki** (syncs phone and desktop with AnkiWeb). It's cheap, but you lose auto-checking, step-by-step reveal and AI hints. It could serve as an M2 fallback.

## 6. Data model (sketch)
```
Book(id, title, edition, license, pdf_hash)
Unit(id, book_id, chapter, section, title, skills[])
Problem(id, unit_id, number, page, type,
        statement_tex, figures[], answer_tex, answer_kind{numeric|symbolic|choice|proof|none},
        solution_steps_tex[], solution_source{book|manual|ai|ai_verified|community},
        difficulty, skills[], status{draft|approved|rejected})
Card(id, problem_id, card_kind)       -- one problem can produce several cards
ReviewState(card_id, user_id, fsrs_stability, fsrs_difficulty, due_at, lapses)
Attempt(id, card_id, at, grade, typed_answer?, photo?, time_spent_s, hint_level_used)
```

## 7. Ingestion pipeline details
1. **Register** the PDF: hash it, record the book metadata, and map PDF page numbers to printed page numbers.
2. **Segment**: find exercise sections, using the table of contents or the PDF outline when present.
3. **Extract**: send page images to Claude and get back JSON for each problem, with LaTeX, the problem number and any figure regions.
4. **Answer match**: extract the answer key and solution-manual pages, then join them on (chapter, section, number).
5. **Fill gaps**: generate a solution for any problem that has none. Verify it with SymPy when the answer is computational; otherwise flag it.
6. **Validate**: check that the LaTeX compiles in KaTeX, that no problem numbers are missing, and that answers are present.
7. **Review**: a desktop screen showing the problem side by side with the PDF crop: approve, edit or reject.
8. **Publish** to the database.

Measured in M1: accuracy, cost per page, and minutes of human review per 100 problems.

## 8. Non-goals (for now)
- Multiple users, social features, or a public app store release.
- Video lectures (link out to them instead).
- Building a theorem prover or Lean checker. Maybe later for Rudin, but not before M7.

## 9. Open decisions
See [QUESTIONS.md](QUESTIONS.md).
