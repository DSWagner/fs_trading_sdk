# Session handoff: Conviction (FS Trading SDK competition entry)

> Last updated: 2026-05-12 (after the resize-stability + form-height-match fix)
> Parent transcript: `[Where we are right now](b5263758-f700-4040-9a30-693a3a1cf730)`

## TL;DR for the next session

1. Read `CLAUDE.md`, `internal_sdk_docs/CLAUDE.md`, and `internal_sdk_docs/PLAYBOOK.md` first.
2. The active feature is **Conviction**, the receipts-first betting demo app in `demo-app/src/conviction/`. Live at `https://fs-trading-sdk-docs.vercel.app`. Repo `https://github.com/DSWagner/fs_trading_sdk` (branch `main`, Vercel auto-deploys on push).
3. All commits MUST be authored as **DSWagner** (see "Git rules" below). Local git config is currently set to "ADMIN David Wagner" which is WRONG. Override per-command with `git -c user.name="DSWagner" -c user.email="35304153+DSWagner@users.noreply.github.com" commit ...`.
4. Latest verified state: the `/m/{id}` BetFlow page is a 50:50 grid with the form on the left and polaroid + chart stacked at identical dimensions on the right, both columns ending at the same vertical position. Rarity sky colors are grey/green/blue/purple/gold/orange. Reasoning quote sits in the lower portion of the photo.

## Architecture quick map

```
demo-app/src/conviction/
  pages/
    BetFlow.tsx        <- /m/:marketId  (THE active page, most recent edits)
    Discover.tsx       <- /discover
    Receipt.tsx        <- /r/:id
    Embed.tsx          <- /e/:id
    Landing.tsx        <- /
    Profile.tsx        <- /u/:handle
    Explore.tsx        <- /explore (gallery browser)
    About.tsx          <- /about
  components/
    Polaroid.tsx       <- THE SVG generator (rarity palette, seed-driven layout)
    AuthGate.tsx
    NavBar.tsx         <- main header (dark mode toggle lives here)
    EditorialState.tsx
  rarity.ts            <- Rarity type, TIER_META, calculateRarity, potentialRarity
  storage.ts           <- localStorage BetRecord persistence
  hash.ts              <- SharedPayload for /e and /r URL hash encoding
  theme.ts             <- CSS-variable palette (light + dark)
```

Architectural rules: this repo is a strict 3-layer monorepo (`core` -> `react` -> `ui`) plus the `demo-app`. Architecture tests enforce no upward imports. Always read `internal_sdk_docs/CLAUDE.md` before adding to `packages/*`.

## What changed recently (commit ladder, latest first)

| SHA       | Title                                                                                                       |
|-----------|-------------------------------------------------------------------------------------------------------------|
| _pending_ | fix(conviction): pin preview createdAt + measure form natural height so columns truly match                 |
| `1aff35d` | polaroid + chart scale down so right column matches form height (width floor 280 -> 220)                    |
| `e756ce3` | rarity-colored skies (grey/green/blue/purple/gold/orange) + lower-anchored reasoning quote                  |
| `93e78eb` | 50:50 BetFlow layout with stacked equal-size visualisations (ResizeObserver via callback ref)               |
| `d67e433` | (superseded) flipped layout to 1/3 form, 2/3 visualisations side-by-side                                    |
| `18b3a3b` | rarity-anchored sky + seed-driven random suns + ground-only reasoning quote                                 |
| `c3b6ea9` | bigger polaroid + chart, compact form chrome, no inner scrollbars                                           |

`d67e433` was a temporary intermediate that's no longer accurate. The current layout is the 50:50 stacked one from `93e78eb` plus the refinements from `e756ce3` and `1aff35d`.

## Critical layout invariants

The BetFlow page must satisfy ALL of these. The snapshot script `scripts/verify-conviction/snapshot-betflow.mjs` asserts the dimensions; do not break the assertions.

1. **50:50 grid** at desktop: `gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)'`. Left column = form. Right column = polaroid stacked above chart.
2. **Polaroid and chart have IDENTICAL bounding rects**. Both width and height must match (DOM-verified by the snapshot assertion `dims.polaroidW !== dims.chartW || dims.polaroidH !== dims.chartH`).
3. **Both columns end at the same vertical position**. The snapshot asserts `Math.abs(dims.formH - dims.asideH) <= 4`. The mechanism: the form column has TWO nested divs - an outer wrapper that carries `min-height: rightColumnTotalHeight` (so the grid cell stretches via `alignItems: stretch`), and an inner div with the `ResizeObserver` callback ref that measures the form's NATURAL content height (free of any min-height). The polaroid + chart are sized so their stacked height equals that natural height (down to a `MIN_VISUAL_WIDTH = 200` floor). When the floor kicks in, the outer wrapper's `min-height` keeps the columns matching at the bottom. This nested structure is the fix for the 2x mismatch the user reported - in the previous setup the ResizeObserver was on the same div as the min-height, so the observed value was the inflated one and the visuals were sized to match the inflated value, leaving the form's natural content much shorter than the visible right column.

4. **Live preview polaroid is invariant under resize/zoom**. The `createdAt` prop on the preview Polaroid is pinned via `useMemo(() => new Date().toISOString(), [])`. Every parent re-render (resize, zoom, slider drag for unrelated state) used to fire the inline `new Date().toISOString()` JSX expression, which fed the polaroid seed via `seedFromInputs(...createdAt)` and reshuffled the suns and stars. The verify script `scripts/verify-conviction/verify-resize-stable.mjs` asserts the SVG signature is byte-identical across 1440 -> 1200 -> 1024 -> 1440 resizes.
5. **No inner scrollbars** anywhere on the page (no `overflow: scroll/auto` inside the columns).
6. **Chart card has rounded corners on all four sides**. `.conviction-chart-shell { overflow: hidden }` in `index.css` clips the Recharts SVG to the card's border-radius.

## ResizeObserver pattern (do not break)

The right and left column ResizeObservers MUST use callback refs, not `useEffect([])`. The aside is hidden during the loading/error early-returns, so a plain `useEffect([])` runs before the aside exists and the observer never attaches. The callback ref pattern:

```ts
const setRef = useCallback((el: HTMLElement | null) => {
  observerRef.current?.disconnect();
  observerRef.current = null;
  if (!el || typeof ResizeObserver === 'undefined') return;
  setState(Math.floor(el.getBoundingClientRect().width));  // seed immediately
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) setState(Math.floor(entry.contentRect.width));
  });
  ro.observe(el);
  observerRef.current = ro;
}, []);
```

## Rarity visual contract

`RARITY_VISUAL` in `Polaroid.tsx` (around line 1237) and `TIER_META` in `rarity.ts` MUST stay in sync. Current mapping:

| Tier      | baseHue | sat  | Color name           |
|-----------|---------|------|----------------------|
| common    | 220     | 0.06 | slate GREY           |
| uncommon  | 142     | 0.62 | emerald GREEN        |
| rare      | 212     | 0.72 | azure BLUE           |
| epic      | 276     | 0.70 | royal PURPLE         |
| legendary | 48      | 0.86 | luminous gold YELLOW |
| mythic    | 24      | 0.92 | warm ORANGE          |

The develop filter in `Polaroid.tsx` (`photoSat`, `sepia`, `photoBlur` around line 384) must remain GENTLE (sat cut `* 0.25`, sepia `* 0.18`, blur `* 1.8`). The previous values (sat `* 0.75`, sepia `* 0.70`) washed every tier brown in the live preview and the user explicitly demanded the rarity hue stay visible during the "developing" animation.

Verification script: `scripts/verify-conviction/snapshot-betflow-tiers.mjs`. Run it after any change to `RARITY_VISUAL`, `TIER_META`, or the develop filter. It walks the prediction slider across the six tiers and saves `snapshots/preview-tier-{common,uncommon,rare,epic,legendary,mythic}.png`.

## Reasoning quote placement contract

In `Polaroid.tsx` (the `ReasoningQuote` call site), the quote anchor y is:

```ts
const quoteAnchorFrac = Math.max(0.72, photo.horizonY + 0.16);
const quoteAnchorY = photoY + photoSize * quoteAnchorFrac;
```

This guarantees the quote scrim sits in the lower 28% of the photo no matter where `horizonY` lands. The quote MUST NOT touch the sky, the suns, or the mountain silhouette. User has flagged this regression three separate times in this conversation.

## Open user-facing items (none blocking)

The user's most recent feedback was resolved by `1aff35d`. Pending Vercel rebuild + hard refresh on the live site. No outstanding bug reports as of this handoff. If the user reports a new issue, default to:

1. Verify the issue reproduces locally (`npm run dev` in `demo-app/`).
2. Run the Playwright snapshot script to capture before/after at 1440 viewport.
3. Make the smallest possible fix.
4. Commit as DSWagner. Push. Tell the user to hard-refresh after Vercel finishes.

## Git rules (HARD CONSTRAINTS)

1. **Author**: every commit MUST be `DSWagner <35304153+DSWagner@users.noreply.github.com>`. The local git config got swapped at some point in this session and is currently `ADMIN David Wagner`. DO NOT update the config (rule from `CLAUDE.md`). Use per-command override: `git -c user.name="DSWagner" -c user.email="35304153+DSWagner@users.noreply.github.com" commit ...`. Always verify with `git log -1 --format='%h %an <%ae>'` after committing.
2. **No `Co-Authored-By`** in commits (rule).
3. **No em dashes** anywhere in code, comments, commit messages, or docs (rule from `CLAUDE.md`: "Never Use Em Dashes every anywhere ever"). Use hyphens, colons, or rephrase.
4. **PowerShell heredoc does NOT work** on Windows. For multi-line commit messages, write to a temp file (`.commit-msg.txt`) and use `git commit -F .commit-msg.txt`, then delete the temp file.
5. **Force push is OK only with `--force-with-lease`** and only to fix a recent commit (e.g. wrong author on the latest HEAD). Don't rewrite history older than 1-2 commits.

## Test commands

```
npx vitest run                            # all unit tests
cd demo-app && npx vite build             # demo-app prod build
cd packages/docs && npx docusaurus build  # docs build
```

Snapshot scripts (start the dev server first with `npm run dev` in `demo-app/`):

```
node scripts/verify-conviction/snapshot-betflow.mjs              # main layout + invariants
node scripts/verify-conviction/snapshot-betflow-tiers.mjs        # all 6 rarity tier previews
node scripts/verify-conviction/snapshot-rarity-tiers.mjs         # resolved-state tier snapshots
node scripts/verify-conviction/snapshot-betflow-narrow.mjs       # form/aside height match at narrow viewports (set VW=1024)
node scripts/verify-conviction/verify-resize-stable.mjs          # polaroid SVG is byte-identical across resizes
```

## Currently running processes

There is likely a vite dev server still running on port 3000 from this session (PID was 31436 at last check). If port 3000 is busy:

```powershell
$conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```

Then `cd demo-app && npm run dev`.

## Competition eligibility audit (re-checked 2026-05-12)

Cross-reference: `https://ecosystem.functionspace.dev/competition` and `https://ecosystem.functionspace.dev/competition/setupguide`.

Code-side compliance (everything that we control):

- Public fork of `functionspace/fs_trading_sdk` (verified: `git remote -v` shows upstream pointing at the canonical repo). Required.
- `demo-app/.env` contains the exact required dev endpoint: `VITE_FS_BASE_URL=https://fs-engine-api-dev.onrender.com`.
- Auth flows go through `PasswordlessAuthWidget` from `@functionspace/ui` (see `components/AuthGate.tsx`). No password forms anywhere.
- All belief/payout math is via `@functionspace/core` (`generateGaussian`, `generateRange`, `generateBelief`). No reimplemented bucket math.
- All data and trades go through `@functionspace/react` hooks (`useMarket`, `useBuy`, `usePreviewPayout`, `useAuth`). No raw `fetch` in `BetFlow.tsx`.
- Local dev runs on port 3000 exactly (the setup guide forbids falling back to 3001).
- Commit author: every commit MUST be `DSWagner <35304153+DSWagner@users.noreply.github.com>` (per "Git rules" above).

Submission-side actions (the USER must do these at submission time):

- Follow `@functionspaceHQ` on X.
- Tag `@functionSPACEHQ` in a post about the build with a screenshot or demo video.
- Submit at `https://ecosystem.functionspace.dev/competition/submit` with: Telegram handle, project name, "what you built", market IDs used (the live demo lets the user pick from `discoverMarkets`), GitHub repo URL (`https://github.com/DSWagner/fs_trading_sdk`), Deployed URL (Vercel), X post URL, IP-terms acknowledgement.

Submissions can be updated until close (~18 May 2026) and the most recent submission per repo URL is what gets judged.

## Useful pointers

- User's GitHub handle: `DSWagner` (personal). The competition fork lives at `https://github.com/DSWagner/fs_trading_sdk`. There's an older "submission" repo at `https://github.com/DSWagner/FS_SDK_Submission_1` but the active one is `fs_trading_sdk`.
- Vercel project: `fs-trading-sdk-docs` (auto-deploys from `origin/main`). The competition prefers the demo-app build, not the docs build.
- Competition site: `https://ecosystem.functionspace.dev/competition`.
- The `Polaroid` component is large (~1700 lines). Use the Grep / Read tools with specific line offsets; do NOT read it in one pass.

## Quick orientation script for the next session

```
# 1. Confirm where the user left off
git log --oneline -8

# 2. Verify recent commit authors are DSWagner
git log -8 --format='%h %an'

# 3. Skim the active page
# Open: demo-app/src/conviction/pages/BetFlow.tsx
# Open: demo-app/src/conviction/components/Polaroid.tsx (rarity palette section ~line 1237)

# 4. Run the snapshot script to confirm layout invariants still hold
cd demo-app; npm run dev    # in one shell
node scripts/verify-conviction/snapshot-betflow.mjs     # in another
# Expected: PREVIEW DIMS with polaroidW == chartW, polaroidH == chartH, formH == asideH
```
