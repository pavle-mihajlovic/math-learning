# Deploy (B09): Cloudflare Pages

About 5 minutes of clicking. The site is static (`npm run build` → `dist/`), and every push to `main` redeploys it automatically.

## One-time setup

1. Go to **dash.cloudflare.com** and sign in (or create a free account).
2. In the left sidebar, open **Compute (Workers) → Workers & Pages**. Click **Create**, choose the **Pages** tab, then **Connect to Git** (Import an existing Git repository).
3. Click **Connect GitHub**. In the GitHub window, choose **Only select repositories**, pick **math-learning**, and click **Install & Authorize**. Cloudflare only needs read access, and the repo stays private.
4. Back in Cloudflare, select **math-learning** and click **Begin setup**.
5. Fill in the build settings:
   - **Project name:** `road-to-rudin` (this becomes `road-to-rudin.pages.dev`; pick another if it's taken)
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Under **Environment variables (advanced)**, add `NODE_VERSION` = `22`
6. Click **Save and Deploy**. The first build takes about a minute.
7. Open `https://road-to-rudin.pages.dev` (or the name you chose):
   - **iPhone:** open it in Safari. Tap Share → **Add to Home Screen** for an app icon. Full offline support comes in B10.
   - **Windows / Linux:** open it in Chrome, Edge or Firefox.

Pull requests also get their own preview URL (`<hash>.road-to-rudin.pages.dev`), which Cloudflare posts on the PR.

## Keeping it private until login exists (optional)

The URL isn't linked anywhere and `noindex` is set, but anyone with the link can open it until B12 adds login. The calculus content is OpenStax (CC BY-NC-SA), so this is fine. To lock it now anyway:

1. In the Pages project, open **Settings → General → Access policy** and click **Manage** (this uses Cloudflare Zero Trust, which is free for up to 50 users).
2. Add an **Allow** policy with **Include → Emails →** your email address.
3. Visiting the site then asks for a one-time code sent to that email.

## What the build includes

- `dist/content/os-calc/*.json`: 110 units plus `index.json` (about 9 MB in total, loaded one unit at a time)
- `dist/figures/os-calc/*.webp`: about 1,550 figures (about 18 MB)
- `dist/mathlive/fonts`: fonts for the visual editor, served locally
- `public/_headers`: long cache lifetimes for hashed assets and figures; content JSON is always revalidated so content PRs show up right away

Cloudflare Pages' limits (20,000 files, 25 MiB per file) are far away.
