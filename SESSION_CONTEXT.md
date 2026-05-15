# Session handoff: Conviction (FS Trading SDK competition entry)

> Last updated: 2026-05-14 (LATE AFTERNOON). Five new flagship features shipped on top of the morning's tactical hardening: **(A) Conviction Streak Halo** -- a concentric SVG halo with an orbiting comet at high tiers, rendered around the user's handle in the NavBar. Pure-derived from `computeStreak` over the local rarity ledger (`demo-app/src/conviction/streak.ts`), no engine cost. Five visual tiers (0/1/2/3/4) keyed off the current streak length, with a matching `<StreakCaption>` tag for wider viewports. **(B) Receipt for Receipt challenge** -- a "Challenge this call" CTA renders on someone else's receipt (signed-in viewer + open market). Clicking it navigates to `/m/:marketId?challenge=<base64>`. The BetFlow page decodes the payload and seeds the sliders with a *mirrored* counter-prediction (reflected across the consensus and clamped to bounds), a Markdown-style quoted reasoning blockquote, neutral 0.5 conviction, and the original shape. An eyebrow flips from "STAKE A CONVICTION" to "CHALLENGE @author" to telegraph the mode. Plumbing lives in `demo-app/src/conviction/challenge.ts`. **(C) Convex Hull Frontier widget** -- a new Discover-page section plots every live trade as a (prediction, log-stake) point and draws Andrew's monotone-chain convex hull as a dashed editorial frontier. Each vertex is a clickable link to its source market. Math in `demo-app/src/conviction/convexHull.ts`. **(D) Live Calibration Leaderboard** -- new `/leaderboard` route ranks authors by `1 - mean(|conviction - accuracy|)` across resolved bets, combining local localStorage history with the demo galleries' baked-in `__demoOutcome` values. Pure scoring in `demo-app/src/conviction/calibration.ts`. **(E) Receipt-as-NFT (no chain)** -- every bet now signs a canonical receipt fingerprint with a per-device Ed25519 keypair stored in localStorage. The Receipt page renders a `VerifiedReceiptBadge` that recomputes the fingerprint at view-time and verifies it against the stored signature, surfacing one of five verdicts (verified / tampered / invalid / unsigned / unsupported). Module at `demo-app/src/conviction/receiptNft.ts`. The whole NFT layer is purely additive -- on hosts without Ed25519 the badge falls back to "verification unavailable" and the rest of the receipt continues working unchanged. **(F) Tests for everything** -- five new pure-function test files (`streak.test.ts`, `challenge.test.ts`, `convex-hull.test.ts`, `calibration.test.ts`, `receipt-nft.test.ts`) plus five new render tests (`streak-halo-render.test.tsx`, `verified-receipt-badge-render.test.tsx`, `leaderboard-render.test.tsx`, `convex-hull-frontier-render.test.tsx`, `challenge-button-render.test.tsx`). Total client-side conviction tests is now **479 across 39 files** (up from 390/27). SDK hooks consumed unchanged at 12.
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
    BetFlow.tsx        <- /m/:marketId  (decodes ?challenge=<base64> for receipt-for-receipt mode)
    Discover.tsx       <- /discover (now includes TheWire + ConvexHullFrontier)
    Receipt.tsx        <- /r/:id (renders VerifiedReceiptBadge + ChallengeBlock + share panel under polaroid)
    Embed.tsx          <- /e/:id
    Landing.tsx        <- /
    Profile.tsx        <- /u/:handle (Live Portfolio first, then Rarity Ledger, then Achievements)
    Explore.tsx        <- /explore (gallery browser)
    Leaderboard.tsx    <- /leaderboard (NEW: live calibration leaderboard)
    About.tsx          <- /about
  components/
    Polaroid.tsx       <- THE SVG generator (rarity palette, seed-driven layout)
    AuthGate.tsx
    NavBar.tsx         <- main header (dark mode toggle + StreakHalo + StreakCaption + Leaderboard link live here)
    StreakHalo.tsx     <- NEW: derived SVG ornament from rarity ledger
    ConvexHullFrontier.tsx <- NEW: 2D scatter + Andrew's monotone chain hull
    VerifiedReceiptBadge.tsx <- NEW: Ed25519 verify badge
    EditorialState.tsx
  rarity.ts            <- Rarity type, TIER_META, calculateRarity, potentialRarity
  storage.ts           <- localStorage BetRecord persistence (now carries optional signature)
  hash.ts              <- SharedPayload for /e and /r URL hash encoding
  theme.ts             <- CSS-variable palette (light + dark)
  streak.ts            <- NEW: computeStreak + haloTreatmentForStreak (pure)
  challenge.ts         <- NEW: buildChallengeUrl / decodeChallengeFromSearch / mirrorPrediction
  convexHull.ts        <- NEW: Andrew's monotone chain + collinearity check (pure)
  calibration.ts       <- NEW: calibrationScore + buildLeaderboard (pure)
  receiptNft.ts        <- NEW: Ed25519 sign / verify + canonicalFingerprint
```

Architectural rules: this repo is a strict 3-layer monorepo (`core` -> `react` -> `ui`) plus the `demo-app`. Architecture tests enforce no upward imports. Always read `internal_sdk_docs/CLAUDE.md` before adding to `packages/*`.

## What changed recently (commit ladder, latest first)

| SHA       | Title                                                                                                       |
|-----------|-------------------------------------------------------------------------------------------------------------|
| _pending_ | feat(conviction): Streak Halo + Receipt-for-Receipt + Convex Hull frontier + Calibration leaderboard + Ed25519 receipt-NFT signing (5 features, 89 new tests) |
| _pending_ | fix(conviction): crowd-polaroid label, Profile section order, Receipt share panel relocation, Landing eyebrow trim, defensive polaroid aspect-ratio |
| _pending_ | feat(conviction): replay sparkline + comparison pair + achievements + route ErrorBoundary + unified ShareKit + lavender OG card |
| _pending_ | feat(conviction): The Wire (useTradeHistory) + Consensus Drift Sparkline (useMarketHistory) + light mode palette deepening |
| _pending_ | fix(conviction): aurora palette + bead ornament + Receipt local-fallback + shared demo galleries module     |
| `0b0fd8e` | feat(conviction): live develop on Receipt + live portfolio P&L on Profile + cash-out flow + slider crash fix |
| `11fbb08` | fix(polaroid): reasoning quote can no longer overflow the photo frame (local commit, push pending)          |
| _pending_ | feat(polaroid): celestial events overhaul (1-6 stars + comets + nebula + aurora, continuous rarity gradient) |
| `01bc862` | fix(conviction): hide SDK auth widget admin-mode pivot links so users see only the passwordless flow         |
| `647802c` | fix(conviction): remove modal-in-modal nesting in NavBar sign-in, use SDK widget directly                    |
| `dc4f0b0` | feat(conviction): thin global scrollbars, NavBar sign-in modal, mobile polaroid stacks no longer clip top   |
| `cf07d2c` | feat(conviction): side-by-side before/after polaroids in BetFlow preview, toggle removed, centered label    |
| `f1dd726` | feat(polaroid): auto-fit reasoning font + 240-char input cap so quotes always fit inside the photo          |
| `d94341c` | feat(conviction): hierarchical multi-star topology per rarity (1/2/4/5/6/7, no 3-body problem)             |
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

1. **50:50 grid** at desktop: `gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)'`. Left column = form. Right column = polaroid PAIR row stacked above chart.
2. **Polaroid pair keeps 1.5 portrait ratio per polaroid. Chart fills the aside**. The right aside renders TWO polaroids side-by-side (`data-betflow-polaroid="before"` and `data-betflow-polaroid="after"`) separated by `POLAROID_PAIR_GAP` (12 px). Each polaroid width = `(asideW - POLAROID_PAIR_GAP) / 2`, capped at 450 px and also constrained by `heightDerivedVisualWidth = heightDerivedVisualHeight / 1.5`. The chart wrapper is `width: 100%` so it fills the entire aside. The snapshot script asserts `polaroidH ~ polaroidW * 1.5` for BOTH polaroids, `beforeW === afterW`, `chartW > polaroidW`, and `chartW >= asideW * 0.95`.
3. **Both columns end at the same vertical position - PIXEL-PERFECT**. The snapshot asserts `Math.abs(dims.formH - dims.asideH) <= 4` and the audit dims confirm `formInner.h = aside.h = 1048` at 1440 wide. The mechanism is a four-piece contract; do not break any of them:
   - The form column has TWO nested divs. The OUTER wrapper is a flex column (no min-height). The INNER div carries the `ResizeObserver` callback ref AND `min-height: MIN_VISUAL_TOTAL = RIGHT_COL_CHROME + 2 * MIN_VISUAL_HEIGHT` so the form column never shrinks below the visuals' floor. The inner is also `display: flex; flex-direction: column` because (next bullet).
   - The auth + CTA group inside the inner form column has `marginTop: 'auto'`. When the form's natural content is shorter than `MIN_VISUAL_TOTAL` (narrow viewports, before the user types reasoning), the CTA gets pushed to the bottom of the inflated column instead of leaving an empty band below the CTA. When the form's natural content is taller, marginTop:auto is a no-op.
   - The polaroid-pair row + chart stack is symmetrical: each polaroid in the row is `previewVisualHeight` tall, and the chart wrapper is `height: previewVisualHeight`. With both at the same height the aside total = `chrome + 2 * previewVisualHeight = formColumnHeight`.
   - The header row above the polaroid pair contains ONLY the centered `LIVE PREVIEW * YOUR RECEIPT` label (no toggle - the user explicitly removed it because the label and toggle were competing for horizontal space and the label was getting cropped). The header is `width: 100%` with `justifyContent: 'center'` and a fixed `height: 36` so `RIGHT_COL_CHROME` stays accurate. **If you ever change this row, re-snapshot the betflow page and verify `aside.h === formInner.h`.**
   - There is NO before/after preview toggle. Both states are rendered simultaneously: the LEFT polaroid is `resolutionState: 'open'` (developing, no reasoning visible), the RIGHT polaroid is `resolutionState: 'resolved'` with `resolvedOutcome: prediction` (fully developed, sharp, colored, reasoning over the ground). Both share the same seed/inputs; only the `mode`-suffixed `positionId` differentiates them.

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

**Stellar topology per tier (strictly incremental, +1 star per tier).** `rarityTopology()` in `Polaroid.tsx` returns group sizes:

| Tier      | Total stars | Topology (group sizes) |
|-----------|-------------|------------------------|
| common    | 1           | `[1]`                  |
| uncommon  | 2           | `[2]`                  |
| rare      | 3           | `[2, 1]`               |
| epic      | 4           | `[2, 2]`               |
| legendary | 5           | `[2, 2, 1]`            |
| mythic    | 6           | `[2, 2, 1, 1]`         |

Star count strictly increments by one per tier so the rarity ladder reads at a glance. Each count decomposes into binary pairs + singletons so the existing pair-placement code lights up the right number of slots, and the composition reads as a hierarchy of close pairs at distance rather than a crowded cluster. Group centres for 2+ groups are placed on a deterministic 2D template (line, triangle, or quad) with small seed-driven jitter; star radius scales DOWN as total body count rises so 6-star systems do not turn into a single blob.

**Celestial events per tier (`buildPhoto` in `Polaroid.tsx`).** Each event scales monotonically with `rarityLevel(rarity)` (0-5 from common to mythic) so richness increases with the tier. All deterministic via a dedicated `eventRng = mulberry32(seed ^ 0xc0_de_fe_ed)`:

| Tier      | Comets                  | Nebula             | Aurora                          |
|-----------|-------------------------|--------------------|---------------------------------|
| common    | 0                       | none               | none                            |
| uncommon  | 35% chance of 1         | none               | none                            |
| rare      | 65% chance of 1         | none               | none                            |
| epic      | 1 always                | light (0.35)       | none                            |
| legendary | 1 always (50% of 2)     | medium (0.55)      | single soft jade band           |
| mythic    | 2 always (35% of 3)     | strong (0.85)      | 3 bands: jade + magenta + accent |

Render order inside the photo clip group is: sky gradient -> aurora curtain(s) -> nebula glow patch -> background stars -> comets -> suns -> silhouette fill -> silhouette outline. New layers always go between the sky and the suns so they read as atmospheric depth without occluding the foreground.

If you change topology or event probabilities, also update the snapshot expectations in `scripts/verify-conviction/snapshot-betflow-tiers.mjs` and re-run that script to verify each tier still reads visually.

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

## Live data integrations (Receipt + Profile, 2026-05-13)

Three SDK hooks Conviction did not previously use are wired up to turn static receipt snapshots into living objects:

### `useMarket(id, { pollInterval })` for live drift on Receipt

`pages/Receipt.tsx` now passes `{ pollInterval: 5_000 }` to `useMarket`. The new `components/LiveConsensusCard.tsx` consumes the polled market state and renders one of three shells:

1. **Open + drift detectable**: shows live consensus μ vs the pinned `consensusAtBet`, signed Δ as % of range, and a verdict colour (jade if the crowd is moving toward the user's prediction, ember if drifting away, muted if no drift yet).
2. **Open + no drift yet**: muted "No drift yet" label.
3. **Resolved**: pivots to a SETTLED outcome block with the final outcome, the user's call, and the absolute error band.

Rarity is **NOT** recomputed against the live consensus — the polaroid keeps using `consensusAtBet` so rarity is stable across reloads.

### `usePreviewSell` + `useSell` for cash-out on Receipt

`components/CashOutPanel.tsx` is rendered only when the viewer is the bet author AND the market is still open AND the position has not been cashed out. It polls `previewSell(positionId)` every 10 s to display the current sell value and unrealized P&L (signed via `formatSignedDollars` so we never render `$-7.00`). A two-stage confirm guards `useSell(marketId).execute(positionId)`. On success:

- The realized record is written to `localStorage` via the new `recordCashOut` helper in `storage.ts` (key `conviction.v1.cashouts`).
- `onCashedOut(record)` fires; the Receipt page sets `landingPending: true` and renders the new `components/CashedOutStamp.tsx` overlay over the polaroid. The stamp's landing animation runs once via the `animateLanding` prop.
- The CashOut panel collapses into a static realized summary.

The SDK's `useSell` already calls `invalidate(marketId)` internally, so the live drift card and any nearby `usePositions` subscribers refresh automatically.

### `usePreviewSell` for live portfolio P&L on Profile

`components/LivePortfolioSection.tsx` is rendered once per market the user has open positions in. It uses `useMarket(marketId, { pollInterval: 15_000 })` for market metadata and polls `previewSell(positionId)` for every position in that market on the same cadence. Each thumbnail polaroid gets a corner P&L badge (jade gain, rose loss, muted flat). The section header aggregates STAKED / VALUE / UNREALIZED P&L.

`pages/Profile.tsx` partitions enriched bets into open + resolved buckets when `isOwn === true`. Open bets go through the live portfolio block; resolved bets stay in the static "settled archive" grid below it. Non-owner profiles continue to use the full static grid (the preview-sell endpoint requires the caller to own the position).

### Replay sparkline (animated drift playback)

`components/ConsensusDriftSparkline.tsx` exposes a Play/Pause pill (visible only when the market has ≥ 3 snapshots). The pill toggles an `isPlaying` flag that drives a `requestAnimationFrame` loop. On each tick we map `now - playStartRef.current` to a [0, 1] `playProgress` and slice the snapshot list to `Math.round(points.length * playProgress)`. Two SVG paths are rendered: a faded `fullPath` ghost trace (full-history) and a darkening `playedPath` foreground (truncated). A separate `PlayheadDot` interpolates between the last fully-played snapshot and the next, so the cursor reads as a smooth playhead rather than jumping snapshot-to-snapshot. After replay (`playProgress === 1`), the rendered output is byte-identical to the pre-replay version.

### Comparison pair (you vs the crowd)

`components/ComparisonPair.tsx` renders two `Polaroid` instances side-by-side: the user's bet (left) and a synthesised "crowd polaroid" (right). The crowd polaroid pulls its `prediction`, `spread`, and `conviction` from `summariseConsensus(curve, lowerBound, upperBound)` — a pure helper that trapezoidal-integrates the `useConsensus` density curve to produce the three scalars the Polaroid renderer needs. The crowd polaroid is deterministic per market (its `marketId` is prefixed with `crowd-` to give it a separate procedural seed). A `DiffBand` below the pair quantifies the distance ("You are 12.3% of the range higher than the crowd"); post-resolution it adds a verdict ("You called it tighter than the crowd." / "The crowd called it tighter than you." / "You and the crowd landed equally close.").

`summariseConsensus` returns `null` for degenerate inputs (undefined / empty / fewer than 3 points / zero mass / NaN-laden), so the comparison block hides itself rather than rendering a misleading half-broken polaroid. The `ComparisonPair` itself renders a skeleton block while `useConsensus` is still loading.

### Achievements (client-side badges on Profile)

`achievements.ts` is a pure-function module: it consumes an `AchievementBet[]` (rarity, accuracy, conviction, resolutionState, disagreement) and returns nine `AchievementUnlock` records. Tiers are bronze / silver / gold; badges are evaluated against the local ledger only (zero engine cost). Monotonicity is a hard invariant — once a badge unlocks it can never lock again, enforced by tests. `components/AchievementsStrip.tsx` renders a horizontal grid on the Profile page (between RarityLedger and CalibrationCard). Locked tiles render greyed out with a progress marker (e.g. `2 / 5`) and a `Locked.` hint via `title=`; unlocked tiles flip to colour and surface the editorial caption via `title=`. The strip is intentionally non-interactive — no modals, no clicks.

### ShareKit (unified share row on Receipt)

`components/ShareKit.tsx` exposes one share row at the bottom of the Receipt page with four actions: **Share** (Web Share API, file-bearing on mobile/Chromium, URL-only fallback, Twitter intent as last resort), **Copy link** (uses `navigator.clipboard.writeText` with a `document.execCommand('copy')` fallback for legacy browsers; shows a 1.8 s toast confirmation), **Download PNG** (delegates to the existing `downloadPolaroidPng` utility), and a textual handle row pointing to the author's profile. Replaces the older standalone "Download as PNG" button so the page has ONE share surface instead of two. The PNG path uses the SAME `downloadPolaroidPng` pipeline as before — no behaviour drift on existing share PNGs.

### ErrorBoundary at every route

`components/ErrorBoundary.tsx` is a class component (the only way to install an error boundary in React 18). `App.tsx` wraps BOTH the main `ConvictionShell` Routes AND the `EmbedPage` Routes with it, keying off `location.pathname` so a crashed boundary resets automatically on the next navigation. The default fallback is on-brand (lavender card, mono eyebrow with route label, Bricolage headline, ember "Try again" pill, paper "Back to the front" link) and exposes the error message in a collapsible `<details>` element. Crashes are logged via `console.error` only — no telemetry, no exfiltration.

`storage.ts` was also hardened: all localStorage operations are wrapped in `try/catch` so quota-exceeded errors or private-browsing-disabled storage never blow up the page.

### OG card refresh

`demo-app/public/og-card.svg` was redrawn in the lavender + ember palette to match the live UI. The new card shows three rotated polaroids (epic / legendary / mythic, each with a different procedural sky and a tier-coloured handle line) over the editorial headline. The previous card was still in the old sepia palette and read as a different product on Twitter previews.

### Slider-drag crash fix (Polaroid memo + useDeferredValue + rAF-coalesced setPreviewBelief)

User-reported: "when I play a lot with the sliders the website can crash". Root cause was a client-side render storm, NOT a Vercel issue:

1. Each slider tick regenerated the polaroid seed (which feeds `buildPhoto`'s star / sun / comet / aurora / nebula procedural generation), redrew TWO polaroid SVGs (before + after), and synchronously broadcast a new preview belief to the `ConsensusChart` subscriber. At 60+ Hz drag rate the main thread saturated and the page eventually OOM'd.

Three independent fixes, all in BetFlow + Polaroid:

- `components/Polaroid.tsx`: the function component is now `export const Polaroid = memo(PolaroidImpl)`. Default shallow prop equality is the right comparator because every prop is either a primitive or a stable object reference. This eliminates wasted re-renders triggered by parent state changes that don't actually affect the polaroid.
- `pages/BetFlow.tsx`: the slider state values that feed the polaroid seed (`prediction`, `spread`, `conviction`, `collateral`, `shape`, `reasoning`) are now wrapped in `useDeferredValue` for the polaroid call sites only. The chart, payout preview, badges, and CTA still consume the live values so they feel instant; the polaroid renders at low priority and React skips intermediate frames during a fast drag.
- `pages/BetFlow.tsx`: the `setPreviewBelief(belief)` broadcast in the slider effect is now coalesced through `requestAnimationFrame` so the chart subscriber gets at most one redraw per paint frame regardless of how fast the slider changes.

Together these cap the heaviest-render path to roughly the browser's paint rate and eliminate the crash. Snapshot scripts and the 277-test unit suite all stay green.

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
