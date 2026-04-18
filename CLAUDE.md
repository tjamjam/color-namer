# color-namer

Chrome extension (new tab replacement) that shows a color chip, asks what the user would call it, submits to Supabase, and renders the global response distribution on a WebGL canvas. Crowd-sourced color naming across languages and color-vision types.

## Stack

- **Framework:** Plasmo 0.90.5 (Chrome MV3). **Not Next.js** — ignore the global Next.js default for this repo.
- **UI:** React 18.2 with inline styles (no Tailwind, no CSS framework). Fonts: Noto Sans (`@fontsource/noto-sans`).
- **Language:** TypeScript 5.3.3, extends `plasmo/templates/tsconfig.base`.
- **Backend:** Supabase (`@supabase/supabase-js`), anon key shipped to client.
- **Rendering:** Custom WebGL shader in `components/ResultsCanvas.tsx` for the cluster visualization.
- **Build output:** `build/chrome-mv3-dev` (dev), `build/chrome-mv3-prod` (prod).
- **Node:** 20 (see `.nvmrc`).

## Conventions

- **Imports:** Use Plasmo's `~` alias (e.g. `~lib/palette`, `~components/ResultsCanvas`). **Not** `@/`.
- **Prettier:** No semicolons, double quotes, no trailing commas, `bracketSameLine: true`, 80-col width. Import order is enforced by `@ianvs/prettier-plugin-sort-imports` (builtins → third-party → `~` → relative).
- **Vertical alignment:** Object literals and destructures are often vertically aligned by colon (e.g. `color_hex:  chip.hex,`). Match the surrounding style when editing a block.
- **UI copy:** All lowercase, unicode punctuation (`\u201c`, `\u2192`, `\u2026`). Keep it direct and short.
- **Comments:** Only where WHY isn't obvious. No docstrings on React components.
- **No tests, no linter scripts.** Verify changes by loading the dev build in Chrome.

## Project layout

```
tabs/newtab.tsx            New-tab page entry (Plasmo maps this via chrome_url_overrides)
components/
  ColorNamingUI.tsx        Input → submit → results flow, suggestions, spell-check
  ColorBlindnessModal.tsx  CVD onboarding + settings modal
  ResultsCanvas.tsx        WebGL cluster renderer (max 8 clusters, hard-coded shader limit)
lib/
  palette.ts               The 330-chip WCS palette (CHIPS) + luminance/uiColor helpers
  storage.ts               chrome.storage.local wrappers (user token, named set, CVD type)
  supabase.ts              Typed Supabase client
  database.types.ts        Supabase-generated types (shared project — see below)
  useColorResults.ts       Fetch/submit hook with CVD fallback logic
  i18n.ts                  Chrome Translator API + MyMemory fallback, cached in localStorage
  simplex.ts               2D simplex noise (currently unused in hot path)
scripts/seed-wcs.ts        Seeds Supabase from sibling ../colorful-language/wcs.db (tsx)
.github/workflows/submit.yml  workflow_dispatch → Chrome Web Store via curl
```

## Supabase schema (relevant tables)

The Supabase project is shared with other apps; `database.types.ts` contains unrelated tables (`beaches`, `lake_forecasts`, `profiles`, etc.) — **ignore those**. Color Namer uses:

- `submissions` — one row per user+color (upsert on `color_hex,user_token`). Columns: `color_hex`, `name`, `language`, `locale`, `user_token`, `cvd_type`.
- `color_name_counts` — aggregated view over submissions, keyed by `color_hex + language + name`.
- `user_preferences` — stores `cvd_type` per `user_token`.

CVD filtering: when `cvd_type` is `red-green`, `blue-yellow`, or `complete`, results are filtered to matching users. If fewer than 3 CVD-specific results exist, the UI falls back to everyone's results and shows the `cvdFallback` banner (see `useColorResults.ts`).

## Env

`.env.local` (gitignored) must contain:

```
PLASMO_PUBLIC_SUPABASE_URL=...
PLASMO_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # only needed by scripts/seed-wcs.ts
```

Only variables prefixed `PLASMO_PUBLIC_` are inlined into the extension bundle. CI provides the two `PLASMO_PUBLIC_*` vars via GitHub Actions secrets.

## Workflow

- `npm run dev` — Plasmo dev server with HMR. Load `build/chrome-mv3-dev` as an unpacked extension in `chrome://extensions`. Hit the reload button after Plasmo rebuilds.
- `npm run build` — production bundle to `build/chrome-mv3-prod`.
- `npm run package` — zips the build for store submission.
- **Release:** bump `version` in `package.json`, commit, push, then trigger the "Submit to Web Store" workflow from the Actions tab. There's a `/release` command in `.claude/commands/` that does the bump + commit + push part.

## Quirks to know

- `ResultsCanvas` caps `devicePixelRatio` at 1.5 — rendering at full 3× on retina gave no visible benefit but tripled fragment shader cost.
- Shader is hard-coded to 8 clusters (`uCenters[8]`, `uRadii[8]`, etc.). If you change that, update both the GLSL array sizes and the JS loop in `draw()`.
- Translation uses Chrome's on-device `Translator` API (Chrome 138+) with a MyMemory HTTP fallback. Translations are cached under `i18n_v3_{lang}` in `localStorage` — bump the version prefix if you change `EN` copy.
- `leo-profanity` only has dictionaries for `en`, `fr`, `ru` (see `LEO_SUPPORTED`). Other languages fall back to English.
- The new-tab page sets `backgroundColor: chip.hex` directly on the root div — the 0.8s `transition: background-color` is what drives the color cross-fade between chips.
- `chrome.storage.local` resets the named-colors set once it reaches `CHIPS.length` (cycle restart), see `markColorNamed` in `lib/storage.ts`.

## Commit style

Imperative, present tense, no prefixes, no trailing period. Examples from recent history:

```
Extract data-fetching into useColorResults hook
Show inline error feedback when submission fails
Cap WebGL DPR at 1.5 for performance
Remove noisy i18n console logs
```
