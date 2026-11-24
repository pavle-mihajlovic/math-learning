# Spec sheet (v1, after round-1 answers)

## 1. Product in one sentence
A private web app, installed to the iPhone home screen, that serves bite-sized lessons and auto-checked practice problems. It covers precalculus → Calc I–III → linear algebra → proofs → analysis, and is built toward Baby Rudin and Big Rudin. It works in 1–2 minute bursts and syncs between phone and computer.

## 2. Decisions so far

| # | Decision | Why |
|---|---|---|
| D1 | **Web app (PWA)** added to the iPhone home screen. No App Store, no Mac needed. | No Mac means no native iOS build; a PWA opens like an app. |
| D2 | **Typed answers, auto-checked.** No handwriting or scanning in the core loop. | Your preference; scanning stays an optional later feature. |
| D3 | **Content comes from chats.** Each unit is made in one Claude chat or Claude Code session and saved as JSON in this repo. | No API bill; the "AI-generated bite-sized chunks" you asked for. |
| D4 | **Solution priority: human > AI verified by a math library (SymPy) > AI**, and the app labels which one you're seeing. | You prefer human solutions, and AI ones are OK if labeled. |
| D5 | **Start with free textbooks** (OpenStax Calculus 1–3, Hefferon *Linear Algebra*, Hammack *Book of Proof*, Axler *Linear Algebra Done Right* 4e). Add PDFs you own later. | You have no PDFs yet; these are legal, and several have human-written solutions. |
| D6 | **Review everything from scratch**, starting with a short precalculus refresh. | It's been 7 years. |
| D7 | **Hosting $0:** Cloudflare Pages for the app, plus a Cloudflare Worker with a D1 database for sync. | Free tiers, no monthly bill, and the database never pauses for inactivity (Supabase's free tier does). |
| D8 | **I write the code; you use the app.** Each roadmap task is one chat: you paste the task ID and the chat does it and opens a pull request. | This was question 7, and you don't need to code. |
| D9 | **Repo stays private.** If commercial-book content is added, the site goes behind Cloudflare Access (an email login that lasts a month). | Avoids publishing copyrighted material. |

## 3. Hard requirements
1. Tap the icon and a problem or lesson card is on screen in under 2 s. No menus first.
2. Everything fits on one phone screen per step. You never scroll a PDF.
3. Typing math on an iPhone is fast: a helper key row and a live rendered preview.
4. Answer checking runs **in the browser**, so it works offline.
5. Progress syncs automatically. Offline works and syncs later.
6. Every problem records its source (book and number, or "AI") and which kind of solution it has.

## 4. The two-minute loop
```
open → next card in today's queue
  ├─ Lesson card: short concept / worked example → "Got it"
  └─ Problem card: statement → type answer (live preview) → Check
        ✓ → optional "see solution" → next
        ✗ → retry once  or  "Hint" → retry  or  "Show solution" (step by step)
  → scheduler records the result → next card; quit anytime
```
A wrong problem comes back later through spaced repetition, ideally as a **variant with new numbers** rather than the same problem.

## 5. Content structure
- **Track:** A (precalc), C1, C2, C3, L (linear algebra), P (proofs), then R (analysis).
- **Unit:** one topic, e.g. `C121 u-substitution`. Units are listed in [CURRICULUM.md](CURRICULUM.md).
- **Chunk:** about 2 minutes. One concept card, one worked example, and 3–5 problems.
- **Unit size:** 4–8 chunks, a mixed review set, and 40–60 problems in total.

### Answer kinds the checker must support
| Kind | Example answer | How it's checked |
|---|---|---|
| number | `-3/4`, `2.718` | exact value or within a tolerance |
| expression | `x^2*e^x + C` | evaluate both expressions at random points; `+C` handled |
| equation | `y = 2x + 1` | rearrange to one side and compare, up to a constant multiple |
| interval / set | `(-inf, 2] U (3, 5)`, `{1, -2}` | parse and compare |
| vector / matrix | `[1, 2, 3]`, `[[1,0],[0,1]]` | compare entry by entry |
| special | `DNE`, `inf`, `-inf` | exact keyword |
| choice | multiple choice / true-false | exact match |
| multi-part | (a)…(b)… | each part checked separately |
| proof-ish | reorder steps, fill a gap | exact order or exact gap answer (rigorous proofs are a later AI-critique feature) |

### Problem JSON (sketch, formalized in task B02)
```json
{
  "id": "C121-017",
  "unit": "C121",
  "chunk": 3,
  "difficulty": 2,
  "statement": "Evaluate $\\int x\\cos(x^2)\\,dx$.",
  "answer": { "kind": "expression", "value": "sin(x^2)/2 + C", "var": ["x"] },
  "hints": ["Let $u = x^2$."],
  "solution": ["Let $u=x^2$, $du = 2x\\,dx$.", "$\\tfrac12\\int\\cos u\\,du = \\tfrac12\\sin u + C$."],
  "solution_source": "ai_verified",
  "source": { "type": "ai" },
  "variant_of": null
}
```
`solution_source` is one of `book`, `ai_verified`, `ai`. `source.type` is `book` (with book, section and number) or `ai`.

## 6. Architecture
```
Content chats (Claude Code on this repo)
  → content/<track>/<unit>.json  (checked by the validator + SymPy) → git → Cloudflare Pages build
Phone / computer browser (PWA)
  ├─ content bundle (cached offline by the service worker)
  ├─ answer checker (TypeScript, math.js)
  ├─ FSRS scheduler (ts-fsrs) + IndexedDB local progress
  └─ sync ⇄ Cloudflare Worker + D1   (append-only attempt log, keyed by a one-time "sync code")
```
- **Stack:** Svelte + Vite + TypeScript, KaTeX, math.js, ts-fsrs.
- **Sync:** each device sends its new attempts and pulls the others. Because the log is append-only, merging never conflicts. You set up a device once by pasting the sync code or scanning a QR code.
- **Optional later:** AI hints and photo critique through the Claude API, pay-per-use and off by default.

## 7. Later phases (not in v1)
- Turning PDFs into problems, for books you provide (each chapter is one chat).
- Proof critique for Abbott and Rudin exercises, typed on a computer.
- Push reminders (iOS supports these for home-screen web apps).

## 8. Non-goals
A native iOS app, multiple users, social features, and video.
