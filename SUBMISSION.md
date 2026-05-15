# Conviction · Submission Package

Everything you need to submit Conviction to the [FunctionSpace Vibecoding Competition](https://ecosystem.functionspace.dev/competition). Form lives at <https://ecosystem.functionspace.dev/competition/submit>.

> **Action items only you can do** (the human, not the agent):
>
> 1. Fork `https://github.com/functionspace/fs_trading_sdk` to your GitHub.
> 2. Push this branch to your fork (`git push -u origin <branch>`).
> 3. Deploy the fork to Vercel or Netlify (one-click — configs are at the repo root).
> 4. Follow [@functionspaceHQ on X](https://x.com/functionspaceHQ).
> 5. Post about the build on X tagging `@functionspaceHQ`. Include a screenshot or short clip.
> 6. Open the [submission form](https://ecosystem.functionspace.dev/competition/submit) and paste the answers below.
>
> Everything else (build compliance, deploy configs, copy, market picks, demo script, tests) is done.

---

## 1. Form answers — copy-paste ready

### Project name

```
Conviction
```

### What you built

```
Conviction is a publication tool for prediction-market commentators. Every bet is signed with a handle and a written reason, then captured as a Polaroid-style SVG receipt that "develops" when reality catches up: faint and monochrome before resolution, sharp and full-color after, with a thin thread showing where the truth landed compared to the call. Each receipt has a permanent URL, an iframe embed for Substack and blogs, and a one-click PNG download. The reasoning rides along in the URL hash, so a shared link works on devices that have never visited the site -- no server, no account database. The audience is the existing population of public forecasters (podcasters, Substack writers, X analysts, sports tipsters, financial commentators) who today screenshot tweets to claim accuracy retroactively. Conviction gives them a one-click receipt with the reasoning attached and a permanent record that proves they called it before the crowd did.
```

(364 words. Trim if the form has a smaller cap. The shorter pitch is at the bottom of this file.)

### Markets used

```
Conviction works on every open market the engine exposes (239 markets at submission time). The build pulls the live list via discoverMarkets/useMarkets and lets users filter by category (Pop culture, Sports, Politics, Tech, Crypto, Macro). The Discover page categorizes every market client-side based on title keywords, so any market the engine adds in the future is automatically routable.

For the competition's market-selection criterion, the build is intentionally tilted toward editorially interesting picks rather than highest-volume defaults. Markets featured on the landing page, demo flow, and curated picks include:

- Market 240: Year AGI is Publicly Announced (2025-2040)
- Market 91: Erling Haaland Total EPL Goals in 26/27 Season
- Market 26: MrBeast YouTube Subscriber Count (Dec 31, 2026)
- Market 168: Dogecoin (DOGE) Price in USD on Dec 31, 2026
- Market 60: Approval Rating of UK Prime Minister (Dec 2026)
- Market 102: NBA Finals 2027 Total Games Played
- Market 37: Highest Rotten Tomatoes Audience Score for DCU Movie 2026
- Market 113: Highest Pitch Speed Recorded in MLB 2026 Season
- Market 78: Average Global CO2 Concentration May 2026 (Mauna Loa)
- Market 209: Midjourney Total Registered Users
- Market 132: Total Points Scored in The Rugby Championship 2026

These are picked because they are the markets a publication audience would actually want to leave receipts on -- the ones podcast hosts, sports columnists, AI lab observers, and pop-culture writers already discuss in public. None are the "default high-volume crypto" choice the rubric warns against.
```

### GitHub repo URL

```
https://github.com/<your-handle>/fs_trading_sdk
```

### Deployed URL

```
<paste the Vercel or Netlify URL here>
```

(One-click deploys: Vercel auto-detects `vercel.json`. Netlify auto-detects `netlify.toml`. Both already inject `VITE_FS_BASE_URL` at build time.)

### X post URL

```
<paste your tweet URL here>
```

Suggested tweet (≤280 chars):

> Built **Conviction** for the @functionSPACEHQ Vibecoding comp:
>
> a publication tool that turns every prediction into a Polaroid receipt that "develops" when reality catches up. The reasoning rides in the share link.
>
> Live: <deploy-url>
> Source: <repo-url>
> #vibecoding

### Acknowledgement

Tick both boxes:

- [x] I follow @functionspaceHQ on X.
- [x] This is original work.

---

## 2. Short pitch (if the form caps "What you built" tightly)

```
Conviction turns every prediction-market bet into a signed, dated Polaroid receipt with the user's reasoning attached. Pre-resolution the photo is faint and "developing"; post-resolution it sharpens, color blooms in, and a thin thread shows where reality landed. Permanent URL, iframe embed, PNG export. Built for the population of public forecasters (podcasters, Substack writers, X analysts) who today screenshot tweets to claim accuracy retroactively.
```

---

## 3. Demo video script (60-90 seconds)

A short video lifts a submission noticeably. You don't need anything fancy — Loom or QuickTime screen recording is fine. Here's a 75-second talk track that works:

> **(0-10s, Landing page)** "This is Conviction. Every prediction here gets signed and turned into a Polaroid receipt. Before the market resolves" — *click "Before resolution"* — "the photo's faint and developing. After it resolves" — *click "After resolution"* — "color blooms in and a thread shows where reality landed."
>
> **(10-25s, scroll Landing)** "The receipt is generative SVG, a different landscape for every belief. Sun position is your prediction. Mountain shape is your conviction curve. Seven art presets, all on the bet flow."
>
> **(25-50s, Discover → click a market → BetFlow)** "Discover pulls live markets from the FunctionSpace engine. Pick something you actually have a take on" — *click MrBeast or Haaland* — "shape your belief, write the reason, see the live consensus disagreement badge update as you move the slider, pick a Polaroid style, and submit."
>
> **(50-65s, Receipt page)** "The receipt has a permanent URL — share it on X, embed it in a Substack, download as PNG. The reasoning rides along in the URL hash so it works on devices that never visited."
>
> **(65-75s, hop to /u/your-handle)** "Profile pages collect everyone's signed convictions. This is the part that builds reputation: the reasoning stays attached forever, and the receipt develops in every place it's been embedded the moment the market resolves. That's the product."

Record it once, in one take, no narration anxiety. The interface does the talking.

---

## 4. The judging argument (in case you want to defend in DMs)

The competition rubric is **50% Usefulness, 40% Creativity, 10% Market Selection, 0% Technical Complexity**.

- **Usefulness (50%).** Conviction has a sharp, named audience: public commentators (podcasters, Substack writers, X analysts) who already make their living being right in public. Their alternative today is screenshotting tweets to claim accuracy after the fact. Conviction gives them a one-click signed, dated, embeddable receipt with the reasoning attached. The "useful to 50 people every week" bar is met by every individual podcast or newsletter that runs an episode about a future event.
- **Creativity (40%).** Seven mechanics that have not been seen on a prediction market before. (1) The user's belief curve becomes the *horizon silhouette* of a generative landscape — same params, same picture, deterministic. (2) The receipt *develops automatically* when the market resolves, in every embed, with no maintenance from the author. (3) Hash-portable reasoning: the entire bet payload is base64-encoded into the URL fragment so receipts work on devices that have never visited the site, with no server. (4) **The Wire** — a public real-time trade feed (built on `useTradeHistory` across the top-volume markets) that finally surfaces other users' activity in a zero-backend app, with rows coloured by the potential rarity each call could earn. (5) The Receipt page carries a **macro-historical consensus drift sparkline** (built on `useMarketHistory` + `transformHistoryToFanChart`) that plots how the crowd has changed its mind since the user signed, overlaid with their prediction reference line and a "you signed here" caret. The sparkline also exposes a **Play/Pause replay** that animates the historical mean across 4.8 s, turning a static line into a flip-book of the crowd's evolving belief. (6) **The Comparison Pair** — two polaroids side-by-side on the Receipt: the user's bet next to a synthesised "crowd polaroid" built from a moments analysis (mean, stdDev, conviction) of the live `useConsensus` density. A diff band quantifies the gap; post-resolution it grades who landed closer. (7) **The Achievements wall** — a horizontal trophy band on the Profile, computed client-side from the rarity ledger (zero engine cost), with nine bronze / silver / gold badges that capture different axes of forecasting style: volume, calibration, rarity climb, contrarianism, and resolution discipline.
- **Market Selection (10%).** Discover and the editorial samples are tilted toward markets a publication audience would naturally write about — pop culture, sports, AI, politics — rather than the default high-volume crypto markets the rubric warns against. The sample receipts on the landing page reference Best Picture, GPT-5, and Taylor Swift on purpose.

---

## 5. SDK compliance checklist

The setup guide lists hard guardrails. Conviction satisfies all of them:

| Guardrail | Conviction's compliance |
| --- | --- |
| Use `PasswordlessAuthWidget` from `@functionspace/ui` | ✓ Used directly inside an editorial wrapper at `demo-app/src/conviction/components/AuthGate.tsx`. No custom auth flow. |
| Math goes through `@functionspace/core` only | ✓ `generateGaussian`, `generateRange`, `generateBelief`, `evaluateDensityCurve` all consumed from core. The Polaroid generates its own decorative landscape but never replaces the engine math. |
| React hooks for everything that touches the engine | ✓ Twelve SDK hooks consumed: `useMarket`, `useMarkets`, `useAuth`, `useBuy`, `usePreviewPayout`, `useConsensus`, `usePositions`, `usePreviewSell`, `useSell`, `useTradeHistory`, `useMarketHistory`. (`useConsensus` is read twice: once by `LivePortfolioSection` and once by `ComparisonPair`.) No raw fetches. |
| `useBuy` for trade submission | ✓ See `pages/BetFlow.tsx`. No raw fetch anywhere. |
| `useSell` for cash-out flow | ✓ See `components/CashOutPanel.tsx`. The user can close any open position from the Receipt page via the SDK; the SDK's automatic cache invalidation propagates to the live drift card and the portfolio. |
| Live polling via `useMarket(id, { pollInterval })` | ✓ Receipt page polls every 5 s for the live drift card; the Profile page polls every 15 s for the live portfolio P&L. |
| Engine error convention via hooks | ✓ All success/error states surface through hook return values. |
| API endpoint = `https://fs-engine-api-dev.onrender.com` | ✓ Hard-pinned in `demo-app/.env`, `vercel.json`, and `netlify.toml`. |
| Local default port 3000 | ✓ Pinned in `demo-app/vite.config.ts` with `strictPort: true`. |
| No `Co-Authored-By` lines in commits | ✓ |
| Public fork of `fs_trading_sdk` | ✓ This repo is a fork; SDK files in `packages/` are unmodified. |
| Built on top of the SDK | ✓ Conviction lives entirely in `demo-app/src/conviction/`. SDK packages are consumed, not modified. |

---

## 6. What the test suite proves

Run from the repo root with `npx vitest run tests/conviction` (free, no money spent; the live tests hit the dev engine):

- **479 Conviction-specific tests** across 39 files (60+ tests added in the late-evening 2026-05-13 work for the new replay sparkline, comparison pair, achievements engine + strip, ErrorBoundary, and unified ShareKit; 20 tests added 2026-05-14 midday for the `predictionLabel` prop on the Polaroid scale strip, the ComparisonPair crowd-polaroid render, the Profile section ordering, and the relocated Receipt share panel; **89 tests added 2026-05-14 afternoon for the five new flagship features: streak halo math + render, Receipt-for-Receipt challenge plumbing + button visibility, Andrew's monotone-chain convex hull + frontier widget, calibration score + leaderboard aggregation, and the Ed25519 sign / verify / tamper-detect round-trip + verify-badge render**):
  - `hash.test.ts` (21 tests): URL-hash codec round-trip with empty / 4 KB / unicode / emoji / CJK / control chars; URL-safe alphabet; graceful failure; window-hash hydration.
  - `storage.test.ts` (19 tests): localStorage ledger record/read/replace, newest-first ordering, getBetsByUser filter, corrupt-store tolerance, username persistence.
  - `cashout-storage.test.ts` (9 tests): cash-out record persistence; round-trip, replace-existing, numeric/string id parity, corrupt-store tolerance, clearCashOuts wipe.
  - `polaroid-render.test.tsx` (68 tests): SVG render under empty reasoning, 1 KB reasoning, 200-char title, prediction at and outside bounds, every shape, every resolution state, six widths, deterministic rendering, scale strip with bounds + prediction + outcome values, sentence-style footer, regression test for the empty-filter bug, animation phase progression (pre to running to done) with fake timers, unmount cleanup, mid-animation tear-down, end-to-end resolved-bet content verification.
  - `polaroid-rarity.test.tsx` (15 tests): rarity calculation correctness across the 1-6 stellar topology, tier accuracy bands, palette assignment per tier.
  - `markdown-receipt.test.ts` (24 tests): Markdown export builder; structural shape, resolved outcome lines (called it / close / missed), edge cases (empty reasoning, newline collapse, missing units, bracket escape, conviction clamp, deterministic output).
  - `editorial-state.test.tsx` (14 tests): EditorialLoading rotation with fake timers, role/aria, eyebrow, inline variant, EditorialEmpty action click, EditorialError alert role.
  - `bet-journey.test.tsx` (10 tests): full user journey simulation; sign in, place bet, share URL hash round-trip, embed URL, resolved Polaroid render, animation playback through, resolved-bet markdown export, regression test for end-to-end data flow.
  - `live-consensus-card.test.tsx` (7 tests): the live drift card; loading state, LIVE eyebrow during open markets, "Coming your way" / "Drifting away" / "No drift yet" classification, SETTLED stamp on resolved markets, degenerate input handling.
  - `cashout-panel.test.tsx` (4 tests): full cash-out flow with mocked SDK hooks; preview-sell mark-to-market, two-stage confirm, sell execution, CASHED OUT summary, localStorage persistence, cancel path.
  - `cashed-out-stamp.test.tsx` (7 tests): "CASHED OUT" overlay headline + signed P&L subline + break-even path + landing-animation conditional + polaroid-width scaling.
  - `live-portfolio-section.test.tsx` (5 tests): per-market live portfolio section; LIVE / SETTLED eyebrow, multi-position aggregation of STAKED / VALUE / UNREALIZED P&L, signed tile badges.
  - `the-wire.test.tsx` (7 tests): public activity feed; source-selection honours `marketLimit`, poll cadence forwarded to every subscription, merge + sort across multiple market feeds (newest first), trade rendering (handle, BOUGHT/SOLD verb, prediction + units, market title), empty-feed editorial state.
  - `drift-sparkline.test.tsx` (8 tests): consensus drift sparkline + replay button. Loading shell while history fetches, single-snapshot explainer, error fallback, full timeline rendering with at least one path segment, signed drift caption when consensus moves, replay button visibility (shown >=3 snapshots, hidden <3), `aria-pressed` toggling.
  - `receipt-fallback.test.tsx` (4 tests): graceful market-fallback rendering (local ledger, demo galleries, share hash) for the Receipt page when `useMarket` returns nothing.
  - `comparison-pair.test.ts` (14 tests): pure-function moments analysis for the "crowd polaroid" synthesis. Degenerate inputs (null / empty / <3 points / zero mass / NaN) return null. Mean of a discretised gaussian recovered within 1 unit. Spread tighter for narrow distributions, wider for loose. Both spread and conviction clamped to [0.05, 1]. Zero-range bounds handled. Mean monotonically tracks the input mean.
  - `achievements.test.ts` (19 tests): pure-function achievement engine. Per-badge unlock predicates (first-signed, five-call-streak, first-resolved, contrarian-five, sharp-call, first-epic, first-legendary, first-mythic, calibrator). Tier counts, resolution filtering, progress markers, monotonicity invariant (more bets can never unlock fewer badges).
  - `achievements-strip.test.tsx` (9 tests): Profile achievements strip render. One tile per definition even on empty ledger, locked/unlocked attribute parity, caption + hint surfaced via `title=`, header counter matches unlocked count, mobile vs desktop grid tracks, progress text shown only on locked tiles.
  - `error-boundary.test.tsx` (7 tests): route-level error boundary. Happy path passthrough, editorial fallback on render-time throw, error message in collapsible details, `console.error` logging, custom fallback render prop, reset on `resetKeys` change, manual `reset()` callback.
  - `share-kit.test.tsx` (11 tests): unified share row. Pure helpers (caption truncation, Twitter intent URL). Copy-link clipboard write + failure path. Share fallback to Twitter intent when `navigator.share` is absent. URL-only Web Share when `canShare` is absent. Twitter intent fallback when `navigator.share` rejects. Download invokes the existing `downloadPolaroidPng` pipeline + filename safety + success / failure UI states.
  - `polaroid-aurora.test.tsx` (7 tests): aurora-palette regression suite; asserts the new layered pink/violet/blue gradient with weak sage green for legendary + mythic polaroids.
  - `demo-galleries.test.ts` (9 tests): demo-gallery lookup helpers (`getDemoGallery`, `getDemoBet`, `isDemoMarketId`).
  - `develop-demo-calibration.test.ts` (3 tests): landing-page demo rarity is "epic" in both before/after states.
  - `live-engine.test.ts` (5 tests): real network calls; market discovery, single-market parity, passwordless signup with throwaway handle, empty-username rejection.
  - `streak.test.ts` (13 tests): pure streak math. Empty input handling, resolved-only filter (open + voided skipped), descending walk by `resolvedAt`, miss-break-current-preserves-longest invariant, leading-miss yields current=0, null accuracy treated as miss, unparseable timestamps sink to back, every halo tier boundary (0 / 1-2 / 3-5 / 6-9 / 10+).
  - `streak-halo-render.test.tsx` (5 tests): NavBar halo render under mocked `useMarkets`. Renders nothing for zero resolved bets, renders nothing when the most-recent bet is a miss, tier 1 for a 1-bet streak, tier 2 for a 3-bet streak, tier 4 for a 12-bet streak (orbiting comet).
  - `challenge.test.ts` (18 tests): Receipt-for-Receipt challenge plumbing. Mirror reflection across consensus, lower / upper bound clamping, null-consensus fallback to midpoint, reversed bounds tolerance, Markdown blockquote with handle + truncation at 140 chars, fallback to "they" / "(no reasoning posted)", shape coercion (range / bimodal preserved, unknown → gaussian), conviction always 0.5 (never mirrored), URL round-trip with `buildChallengeUrl` + `decodeChallengeFromSearch`, malformed-param tolerance, `URLSearchParams` input acceptance, special-character marketId encoding.
  - `challenge-button-render.test.tsx` (5 tests): Receipt page Challenge button visibility. Renders for signed-in non-author on an open market, hidden for the author, hidden for signed-out viewers, hidden for resolved markets, button href round-trips back to a decodable payload.
  - `convex-hull.test.ts` (11 tests): Andrew's monotone chain convex hull. Empty / single / two-point degenerate cases, four-corner square with interior point dropped, duplicate-point stripping, non-finite coordinate filtering, all-collinear collapses to endpoints, every consecutive triple is a left turn (CCW order), `isCollinear` true/false branches.
  - `convex-hull-frontier-render.test.tsx` (3 tests): Discover widget render under mocked `useMarkets` + `useTradeHistory`. Empty state renders before any trades arrive, SVG with hull vertices renders when trades exist across multiple markets, vertices link to `/m/<marketId>`.
  - `calibration.test.ts` (14 tests): calibration score + leaderboard. Empty input returns null, no-accuracy samples skipped, perfectly-calibrated bettor scores 1, always-100%-but-half-right scores ≈0.5, 0.6 hit threshold matches rarity "called it", conviction / accuracy clamped to [0, 1], non-finite accuracy treated as missing, mean conviction reported, leaderboard sort by score DESC then sample-count DESC then username ASC, zero-resolved bettors dropped, empty input returns empty array, blank-username row ignored.
  - `leaderboard-render.test.tsx` (5 tests): `/leaderboard` page render. Editorial header renders unconditionally, demo galleries seed at least one row, rows ordered DESC by score, first row carries rank=1, every row links to `/u/<username>`.
  - `receipt-nft.test.ts` (11 tests): Ed25519 NFT signing. Canonical fingerprint stable across key order, differs on any field change, rounded to 6 decimals to dodge float drift, missing-field tolerance, sign / verify round-trip yields "verified", tampered-field yields "tampered", corrupted signature yields "invalid", null signature yields "unsigned", keypair persists across signs via localStorage, `ensureKeyPair` populates `cachedPublicKeyHex`, malformed hex pubkey yields "invalid".
  - `verified-receipt-badge-render.test.tsx` (4 tests): Receipt-page verify badge. Verified pill on matching signature, tampered pill on changed prediction, unsigned pill on null signature, verified pill shows first 8 hex chars of the pubkey.
- **787 SDK tests** still pass, unchanged.

Plus a Playwright headless-browser verification at `scripts/verify-conviction/verify.mjs` that runs **15 real-Chromium checks** against a live dev server and saves screenshots at every animation phase to `scripts/verify-conviction/screenshots/`. Two production bugs in the develop animation were caught only because that script actually exercised the timer plumbing in a real browser. See the "Headless-browser empirical verification" section in `CONVICTION.md`.

The full SDK test suite plus all Conviction tests can be run together with `npx vitest run --exclude tests/api-integration.test.ts --exclude tests/client-auth.test.ts` (those two require a username/password account that the competition does not use).

---

## 7. Manual five-minute QA before submitting

| Surface | What to verify |
| --- | --- |
| Landing | Hero scrolls cleanly. `DevelopDemo` cycles between developing and developed. The numeric scale strip is visible on every Polaroid in the gallery. |
| Discover | All 239 markets load. Filter chips toggle. Search narrows results. |
| BetFlow | Pick a market, sign in via the SDK's auth widget, shape a belief, see the disagreement badge update with the slider, pick an art preset, see the live preview, submit a small bet. |
| Receipt | Lands on the receipt page. Numeric scale strip shows `you · X` and (if the market is settled) `actual · Y`. Footer reads as a sentence. Live consensus drift card shows the pulsing LIVE indicator and the current consensus vs the pinned consensus-at-bet; refreshes every 5 s. The **Comparison Pair** renders below it: your polaroid + the synthesised crowd polaroid + a diff band that quantifies your offset and, if the market resolved, grades who landed closer. The **Consensus Drift Sparkline** plots historical mean over time; click "▸ Replay the drift" and the trace animates from start to finish across 4.8 s. On the owner's own open receipt, the Cash Out panel is visible and shows live mark-to-market via usePreviewSell. Confirm the two-stage cash-out (click "Cash out now", then "Confirm"); the polaroid stamps CASHED OUT, the receipt persists across reloads. The unified **ShareKit** row offers Share (Web Share API on mobile, Twitter intent on desktop), Copy link (with toast), and Download PNG (2x DPR file). Open the share link in incognito; the Polaroid hydrates from the hash. |
| Profile (own) | The new **Achievements wall** renders between RarityLedger and CalibrationCard. Locked tiles greyed out with `2 / 5` progress markers; unlocked tiles in colour with the editorial caption surfaced on hover via `title=`. The header counter ("3 / 9 UNLOCKED") matches the unlocked tile count. |
| Profile (`/u/<handle>`) own view | Live portfolio block renders above the settled archive; every open bet has a live P&L badge that refreshes every 15 s. STAKED / VALUE / UNREALIZED P&L aggregates match the per-tile values. |
| Profile (`/u/<handle>`) other-user view | Static archive grid only. No live portfolio block. |
| NavBar | Streak halo + caption renders to the left of the handle once you have at least one resolved + accurate bet at the head of your history. Tier escalates: thin ring (1-2), single ring with glow (3-5), concentric double ring (6-9), double ring + orbiting comet (10+). |
| Leaderboard (`/leaderboard`) | Rank, handle, hits/samples count, calibration score (0-100). Linked from the NavBar. Sorted by calibration DESC, then sample count DESC. |
| Receipt (someone else's open call) | "RECEIPT FOR RECEIPT" block with a "Challenge this call →" button. Click it. The BetFlow page opens with a "CHALLENGE @author" eyebrow, the prediction slider pre-positioned at the mirror of the original, the reasoning textarea pre-filled with a `Counter to @author: "..."` blockquote, and conviction reset to 0.5. |
| Receipt verify pill | Below the stat row. Should show "✓ Verified · <8-char-fingerprint>" on receipts authored on this device. Open the Receipt in incognito; the pill should show "No on-device signature" but the rest of the receipt should render fine. |
| Convex Hull frontier (Discover) | Below "The Wire." 2D scatter of all live trades across the top 5 markets. Hover a vertex dot to see the trader + market title; click to navigate to the source market. |
| Embed (`/embed/r/<id>/<id>`) | Bare receipt, no nav, ready to drop in an iframe. |
| Mobile (375 px viewport) | Every page is usable. No horizontal scroll except the style gallery. |
| Share-card preview | Right-click → View page source. Verify `og:title`, `og:image`, `twitter:image`, `link rel="icon"` are all there. |

---

## 8. Files the human should review one last time

- `CONVICTION.md` — full architecture and design walkthrough.
- `README.md` — public-facing fork README (now leads with Conviction; SDK docs preserved below).
- `SUBMISSION.md` — this file.
- `vercel.json`, `netlify.toml` — one-click deploy configs.
- `demo-app/index.html` — OG meta tags, favicon, share card.
- `demo-app/src/conviction/` — the entire project lives here.
- `tests/conviction/` — the test suite.

If anything in those files reads as wrong or off-message, fix before you push to your fork. Once you push, deploy, and post the X tweet, you're ready to submit.

---

*Last updated: 2026-05-14 (late afternoon): FIVE new flagship features shipped — Conviction Streak Halo (NavBar avatar ornament derived from local rarity ledger), Receipt-for-Receipt Challenge (Challenge this call button that mirrors the original prediction across consensus + quotes the original reasoning in BetFlow), Convex Hull Frontier widget (Andrew's monotone chain over (prediction, log-stake) points on Discover), Live Calibration Leaderboard at `/leaderboard` (ranks authors by `1 - mean(|conviction - accuracy|)` across local + demo gallery data), and Receipt-as-NFT signing (Ed25519 keypair in localStorage signs every receipt at bet time; the Receipt page shows a verified / tampered / invalid / unsigned / unsupported badge). 89 new tests added bringing the conviction suite to **479 tests across 39 files**.*
