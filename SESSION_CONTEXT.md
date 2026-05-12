# Session handoff: Conviction (FS Trading SDK competition entry)

> Last updated: 2026-05-12 (after the hierarchical star-system topology pass: 1/2/4/5/6/7 stars per tier, 3 skipped for the three-body problem)
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
| _pending_ | feat(conviction): hierarchical multi-star topology per rarity (1/2/4/5/6/7, no 3-body problem)             |
| `0b9c4bc` | feat(conviction): pixel-perfect BetFlow column alignment, locale-stable scale strip, 6-tier landing grid    |
| `35140eb` | feat(conviction): Bricolage + Sora + Space Mono font stack, theme-aware photo vignette, three-layer drop shadow |
| `03d6e5a` | feat(conviction): pastel purple + pastel orange palette, distinctive font stack, chart fills aside, uniform rarity border |
| `7ce9c8e` | fix(conviction): pin preview createdAt + measure form natural height so columns truly match                 |
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
2. **Polaroid keeps its 1.5 portrait ratio at `previewVisualWidth`. Chart is wider** - the chart wrapper is `width: 100%` so it fills the entire aside (`asideW`), which is wider than the polaroid by design. The user explicitly asked for this: forcing them to identical width compressed the consensus curves. The snapshot script asserts `polaroidH ~ polaroidW * 1.5`, `chartW > polaroidW`, and `chartW >= asideW * 0.95`.
3. **Both columns end at the same vertical position - PIXEL-PERFECT**. The snapshot asserts `Math.abs(dims.formH - dims.asideH) <= 4` and the audit dims confirm `formInner.h = aside.h = 1048` and `cta.bottom = chart.bottom = 1180` at 1440 wide. The mechanism is a four-piece contract; do not break any of them:
   - The form column has TWO nested divs. The OUTER wrapper is a flex column (no min-height). The INNER div carries the `ResizeObserver` callback ref AND `min-height: MIN_VISUAL_TOTAL = RIGHT_COL_CHROME + 2 * MIN_VISUAL_HEIGHT` so the form column never shrinks below the visuals' floor. The inner is also `display: flex; flex-direction: column` because (next bullet).
   - The auth + CTA group inside the inner form column has `marginTop: 'auto'`. When the form's natural content is shorter than `MIN_VISUAL_TOTAL` (narrow viewports, before the user types reasoning), the CTA gets pushed to the bottom of the inflated column instead of leaving an empty band below the CTA. When the form's natural content is taller, marginTop:auto is a no-op.
   - The polaroid + chart stack is symmetrical: the polaroid is `previewVisualHeight` tall, and the chart wrapper is `height: previewVisualHeight` (NOT `flex: 1 1 auto`). With both at the same height the aside total = `chrome + 2 * previewVisualHeight = formColumnHeight`.
   - The header row above the polaroid (LIVE PREVIEW · YOUR RECEIPT + BEFORE/AFTER toggle) has `width: 100%` and `flexWrap: 'nowrap'` and a fixed `height: 36`. Previously it was constrained to `previewVisualWidth` and wrapped to two lines on every desktop size, silently inflating the chrome from ~36 to ~72 and putting the columns out of sync by ~40 px. **If you ever change this row, re-snapshot the betflow page and verify `aside.h === formInner.h` in `dims.json`.**

4. **Live preview polaroid is invariant under resize/zoom**. The `createdAt` prop on the preview Polaroid is pinned via `useMemo(() => new Date().toISOString(), [])`. Every parent re-render (resize, zoom, slider drag for unrelated state) used to fire the inline `new Date().toISOString()` JSX expression, which fed the polaroid seed via `seedFromInputs(...createdAt)` and reshuffled the suns and stars. The verify script `scripts/verify-conviction/verify-resize-stable.mjs` asserts the SVG signature is byte-identical across 1440 -> 1200 -> 1024 -> 1440 resizes.
5. **No inner scrollbars** anywhere on the page (no `overflow: scroll/auto` inside the columns).
6. **Chart card has rounded corners on all four sides**. `.conviction-chart-shell { overflow: hidden }` in `index.css` clips the Recharts SVG to the card's border-radius.
7. **Numeric labels are locale-stable**. The polaroid scale strip's `formatScaleNumber` and the BetFlow page's `formatMarketNumber` BOTH pass `'en-US'` to `toLocaleString` rather than the browser's `undefined` default. A polaroid is a frozen artifact: when a user shares `/r/{id}` or an `/e/{id}` embed, the receipt MUST render identically across every viewer's locale. Without this fix, a German viewer's browser turned `1374` into `"1.374"` (period-as-thousands-separator) while a US viewer's browser rendered it as `"1,374"`, and the same shared link looked different to different people. Same locale pinning is in `NavBar.tsx` for the wallet display.
8. **The Landing page's "Six tiers. One belief." section shows ALL SIX tiers at desktop**. `StyleGallery.tsx` uses `display: 'grid'; gridTemplateColumns: 'repeat(6, minmax(0, 1fr))'` on desktop instead of a horizontally-scrolling flex row. Previously Mythic got clipped off the right edge of the viewport at desktop widths (the page advertised six tiers but only five were visible). Mobile keeps the carousel via the `isMobile` branch.
9. **Chart axis ticks are integer-clean**. The SDK's `ConsensusChart` accepts optional `xAxisTickFormatter`, `yAxisTickFormatter`, and `tooltipValueFormatter` props (backward compatible defaults: `v.toFixed(1)`, `v.toFixed(3)`, `v.toFixed(4)`). BetFlow passes `formatMarketNumber` for the X-axis ticks and tooltip outcomes so price ticks read as `"0", "1,500", "3,000", "5,000"` instead of the previous `"0.0", "1500.0", "3000.0"`. Density values stay decimal but show `"0"` for the zero baseline instead of `"0.000"` to keep the y-axis tick column narrow.

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

**Polaroid frame thickness is UNIFORM at 5 px for every tier above common.** Common keeps a thin theme-aware 1 px neutral edge (using `palette.rule`, NOT a hardcoded grey, so it adapts to dark mode). Per user request: "make the border thickness the same and make the border slightly thicker so we can see the color in both dark mode and light mode." The COLOR is what changes between rarities, not the thickness. `RARITY_BORDER_WIDTH = 5` constant is defined at the top of `TIER_META` to enforce this.

**Stellar topology per tier (hierarchical multi-star physics).** `rarityTopology()` in `Polaroid.tsx` returns group sizes:

| Tier      | Total stars | Topology (group sizes) | Why                                  |
|-----------|-------------|------------------------|--------------------------------------|
| common    | 1           | `[1]`                  | Single star, naturally stable        |
| uncommon  | 2           | `[2]`                  | Binary pair, naturally stable        |
| rare      | 4           | `[2, 2]`               | Hierarchical quadruple (2 binaries)  |
| epic      | 5           | `[2, 2, 1]`            | Two binaries + distant single        |
| legendary | 6           | `[2, 2, 2]`            | Three binaries (Castor-like)         |
| mythic    | 7           | `[2, 2, 2, 1]`         | Three binaries + distant single      |

Three is INTENTIONALLY skipped. Three similar-mass close stars are the classic three-body problem and would be chaotic, so we never emit such a configuration. Every system we emit is hierarchical: pair-internal separation a1 (~0.08-0.20 normalised photo units) is small, group-to-group separation a2 (~0.30-0.45) is large, and a2/a1 stays in the 2.5-5x range. Group centres for 2+ groups are placed on a deterministic 2D template (line, triangle, or quad) with small seed-driven jitter; star radius scales DOWN as total body count rises so 7-star systems do not turn into a single blob. If you change the topology, also update the snapshot expectations in `scripts/verify-conviction/snapshot-betflow-tiers.mjs` and re-run that script to verify each tier still reads visually.

The develop filter in `Polaroid.tsx` (`photoSat`, `sepia`, `photoBlur` around line 384) must remain GENTLE (sat cut `* 0.25`, sepia `* 0.18`, blur `* 1.8`). The previous values (sat `* 0.75`, sepia `* 0.70`) washed every tier brown in the live preview and the user explicitly demanded the rarity hue stay visible during the "developing" animation.

Verification script: `scripts/verify-conviction/snapshot-betflow-tiers.mjs`. Run it after any change to `RARITY_VISUAL`, `TIER_META`, or the develop filter. It walks the prediction slider across the six tiers and saves `snapshots/preview-tier-{common,uncommon,rare,epic,legendary,mythic}.png`.

## Reasoning quote placement contract

In `Polaroid.tsx` (the `ReasoningQuote` call site), the quote anchor y is:

```ts
const quoteAnchorFrac = Math.max(0.72, photo.horizonY + 0.16);
const quoteAnchorY = photoY + photoSize * quoteAnchorFrac;
```

This guarantees the quote scrim sits in the lower 28% of the photo no matter where `horizonY` lands. The quote MUST NOT touch the sky, the suns, or the mountain silhouette. User has flagged this regression three separate times in this conversation.

## Palette + font contract (do not break casually)

The user explicitly asked for a NON-Claude-default palette and font stack. The combination is "epic + mythic" rarity colors translated into a UI palette: pastel orange + pastel purple, with deep aubergine ink in light mode and lavender cream in dark mode.

| Role        | Light hex   | Dark hex    | Notes                                                  |
|-------------|-------------|-------------|--------------------------------------------------------|
| paper       | `#FAF6FB`   | `#161122`   | Page background; faint lavender in light, deep aubergine in dark |
| paper-deep  | `#F0EAF4`   | `#0E0A18`   | Footer / pressed states                                |
| card        | `#FFFFFF`   | `#1E1830`   | Elevated surfaces (polaroid frame, chart, sliders)     |
| ink         | `#2A1B3D`   | `#F0E8F5`   | Primary text                                           |
| ink-soft    | `#4D3D63`   | `#C9BCD8`   | Body text, chart legend                                |
| ink-mute    | `#7B6E8E`   | `#9388AB`   | Subtitles, axis ticks                                  |
| ink-fade    | `#B0A4C0`   | `#5C4F73`   | Disabled / very subtle                                 |
| rule        | `#E5DCEE`   | `#2D2440`   | Card borders, axis lines, polaroid common edge          |
| ember       | `#E68A4F`   | `#F4A572`   | Pastel orange. Primary CTA, slider thumb ring          |
| ember-deep  | `#C26B30`   | `#E68A4F`   | Hover / active                                         |
| teal (purple) | `#9B7EC8` | `#C5A3F0`   | Pastel purple secondary accent. Variable name kept for backwards-compat with `palette.teal` call sites |
| jade        | `#7BAA76`   | `#95C68A`   | Sage green for positive                                |
| rose        | `#C45A6E`   | `#E07F94`   | Dusty rose for negative                                |

Fonts (current, after the second pass):

- **Display** = `"Bricolage Grotesque"` (Google Fonts, Mathieu Triay 2023). Variable typeface with `opsz` (optical size) and `wdth` axes used as a wonk proxy. We bias `opsz` toward 96 (display end) and `wght` toward 600. Reads as sculptural and contemporary; deliberately NOT a default-Inter / Fraunces / Geist look.
- **Body** = `"Sora"` (Soumitra Roy Choudhury). Geometric sans, futuristic-leaning without being a sci-fi caricature. Replaces Space Grotesk.
- **Mono** = `"Space Mono"` (Colophon Foundry). Retro-futurist NASA-display vibe that matches the polaroid + receipts aesthetic. Replaces DM Mono / JetBrains Mono.

Why this combination matters: the user has rejected two earlier font choices ("Inter + Fraunces" and "Instrument Serif + Space Grotesk + DM Mono") as too mainstream / "AI-default". Do NOT casually revert to those. If a future change needs a different font, pick something equally distinctive and document it here.

Photo vignette overlay (in `Polaroid.tsx`, search for `photoVignetteId`): a radial-gradient `<rect>` rendered on top of the photo content (after the film grain, before the reasoning quote) that fades from fully transparent at center to `palette.card` opacity at the corners. Stop opacities scale with `developIntensity` so the bleed-absorption is strongest in the blurred/developing state where the user reported the dark-mode "halo" issue. Because it fills with `palette.card`, the photo edges blend into the matte in BOTH light and dark modes - the polaroid reads as one cohesive object regardless of theme. Do NOT remove this. The original report: "in the dark mode the polaroid image doesn't look good when out of focus and not sharp blurred because the color of the homaly is not close to the background".

Polaroid drop shadow stack: three-layer Material-style elevation (`baseShadow` in `Polaroid.tsx` around line 354). Tight 0/1/2 + mid 0/6/14 + far 0/24/48 with `palette.shadowDeep` on the far layer. This makes the polaroid card visibly lift off the page in dark mode where a single soft shadow is invisible against `palette.paper = #161122`. Do NOT collapse back to a single shadow.

Recharts dark-mode contrast: the SDK chart paints SVG `<text>` with a `fill` attribute set ONCE at provider construction (does not honor CSS variables natively). To keep legend / axis text / tick lines / tooltip readable on the dark aubergine card we override via CSS in `index.css` (search for ".conviction-chart-shell .recharts-text" and surrounding rules). Necessary because the chart provider is constructed in light mode and Recharts inlines `style="fill:..."` on text elements; only an `!important` rule wins.

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
node scripts/verify-conviction/snapshot-light-dark.mjs           # light + dark betflow screenshots for visual review
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
