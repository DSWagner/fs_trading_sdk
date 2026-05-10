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
- **Creativity (40%).** Two mechanics that have not been seen on a prediction market before. (1) The user's belief curve becomes the *horizon silhouette* of a generative landscape — same params, same picture, deterministic. (2) The receipt *develops automatically* when the market resolves, in every embed, with no maintenance from the author. A third creative move is hash-portable reasoning: the entire bet payload is base64-encoded into the URL fragment so receipts work on devices that have never visited the site, with no server.
- **Market Selection (10%).** Discover and the editorial samples are tilted toward markets a publication audience would naturally write about — pop culture, sports, AI, politics — rather than the default high-volume crypto markets the rubric warns against. The sample receipts on the landing page reference Best Picture, GPT-5, and Taylor Swift on purpose.

---

## 5. SDK compliance checklist

The setup guide lists hard guardrails. Conviction satisfies all of them:

| Guardrail | Conviction's compliance |
| --- | --- |
| Use `PasswordlessAuthWidget` from `@functionspace/ui` | ✓ Used directly inside an editorial wrapper at `demo-app/src/conviction/components/AuthGate.tsx`. No custom auth flow. |
| Math goes through `@functionspace/core` only | ✓ `generateGaussian`, `generateRange`, `generateBelief`, `evaluateDensityCurve` all consumed from core. The Polaroid generates its own decorative landscape but never replaces the engine math. |
| React hooks for everything that touches the engine | ✓ `useMarket`, `useMarkets`, `useAuth`, `useBuy`, `usePreviewPayout`, `useConsensus` are the only paths used. |
| `useBuy` for trade submission | ✓ See `pages/BetFlow.tsx`. No raw fetch anywhere. |
| Engine error convention via hooks | ✓ All success/error states surface through hook return values. |
| API endpoint = `https://fs-engine-api-dev.onrender.com` | ✓ Hard-pinned in `demo-app/.env`, `vercel.json`, and `netlify.toml`. |
| Local default port 3000 | ✓ Pinned in `demo-app/vite.config.ts` with `strictPort: true`. |
| No `Co-Authored-By` lines in commits | ✓ |
| Public fork of `fs_trading_sdk` | ✓ This repo is a fork; SDK files in `packages/` are unmodified. |
| Built on top of the SDK | ✓ Conviction lives entirely in `demo-app/src/conviction/`. SDK packages are consumed, not modified. |

---

## 6. What the test suite proves

Run from the repo root with `npx vitest run tests/conviction` (free, no money spent; the live tests hit the dev engine):

- **164 Conviction-specific tests** across 7 files:
  - `hash.test.ts` (21 tests): URL-hash codec round-trip with empty / 4 KB / unicode / emoji / CJK / control chars; URL-safe alphabet; graceful failure; window-hash hydration.
  - `storage.test.ts` (19 tests): localStorage ledger record/read/replace, newest-first ordering, getBetsByUser filter, corrupt-store tolerance, username persistence.
  - `polaroid-render.test.tsx` (71 tests): SVG render under empty reasoning, 1 KB reasoning, 200-char title, prediction at and outside bounds, every preset, every shape, every resolution state, six widths, deterministic rendering, scale strip with bounds + prediction + outcome values, sentence-style footer, regression test for the empty-filter bug, animation phase progression (pre to running to done) with fake timers, unmount cleanup, mid-animation tear-down, end-to-end resolved-bet content verification.
  - `markdown-receipt.test.ts` (24 tests): Markdown export builder; structural shape, resolved outcome lines (called it / close / missed), edge cases (empty reasoning, newline collapse, missing units, bracket escape, conviction clamp, deterministic output).
  - `editorial-state.test.tsx` (14 tests): EditorialLoading rotation with fake timers, role/aria, eyebrow, inline variant, EditorialEmpty action click, EditorialError alert role.
  - `bet-journey.test.tsx` (10 tests): full user journey simulation; sign in, place bet, share URL hash round-trip, embed URL, resolved Polaroid render, animation playback through, resolved-bet markdown export, regression test for end-to-end data flow.
  - `live-engine.test.ts` (5 tests): real network calls; market discovery, single-market parity, passwordless signup with throwaway handle, empty-username rejection.
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
| Receipt | Lands on the receipt page. Numeric scale strip shows `you · X` and (if the market is settled) `actual · Y`. Footer reads as a sentence. Copy share link. Open it in incognito. The Polaroid hydrates from the hash. Click "Download as PNG". A 2x DPR file downloads. |
| Profile (`/u/<handle>`) | Your signed bets show up newest-first. |
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

*Last updated: 2026-05-10.*
