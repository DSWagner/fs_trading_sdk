/**
 * Snapshot one resolved polaroid per rarity tier on the Receipt page.
 * Verifies the rarity-anchored sky / sun-count rewrite:
 *   - Common  → cream/sepia sky, 1 sun, neutral ornaments
 *   - Uncommon → jade green sky, 1 sun
 *   - Rare     → azure sky, 1 sun
 *   - Epic     → violet sky, 1 sun
 *   - Legendary → gold sky, 2 suns
 *   - Mythic    → ember/crimson sky, 3 suns
 *
 * Each receipt is rendered as a resolved bet whose disagreement+accuracy
 * lands inside the target tier's score range (see rarity.ts scoreToTier).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// Score = disagreement * accuracy. To land in a target tier we keep
// accuracy near 0.95 (small error) and pick disagreement so the product
// lands in the tier's score range.
//   common    score < 0.04        → disagreement ~ 0.02
//   uncommon  score in [0.04, 0.18) → disagreement ~ 0.10
//   rare      score in [0.10, 0.18) → disagreement ~ 0.18
//   epic      score in [0.18, 0.30) → disagreement ~ 0.25
//   legendary score in [0.30, 0.45) → disagreement ~ 0.38
//   mythic    score >= 0.45        → disagreement ~ 0.55
const TIERS = [
  { name: 'common', prediction: 30.6, outcome: 30.0, consensus: 30 },
  { name: 'uncommon', prediction: 40, outcome: 40, consensus: 30 },
  { name: 'rare', prediction: 50, outcome: 49.5, consensus: 30 },
  { name: 'epic', prediction: 60, outcome: 60, consensus: 30 },
  { name: 'legendary', prediction: 70, outcome: 70, consensus: 30 },
  { name: 'mythic', prediction: 85, outcome: 84.5, consensus: 30 },
];

function payloadFor(t) {
  return {
    reasoning: `${t.name.toUpperCase()} call: the crowd missed it, I didn't. This is the meme caption that lives over the ground after resolution.`,
    username: `tier_${t.name}`,
    prediction: t.prediction,
    spread: 4,
    conviction: 0.85,
    collateral: 50,
    shape: 'gaussian',
    createdAt: '2026-01-01T00:00:00.000Z',
    marketTitle: `Test market (${t.name})`,
    consensusAtBet: t.consensus,
    expiresAt: '2026-02-01T00:00:00.000Z',
    resolutionState: 'resolved',
    resolvedOutcome: t.outcome,
    lowerBound: 0,
    upperBound: 100,
  };
}

function encodePayload(p) {
  const json = JSON.stringify(p);
  const utf8 = unescape(encodeURIComponent(json));
  return Buffer.from(utf8, 'binary')
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  const marketId = href.replace('/m/', '');

  for (const t of TIERS) {
    const payload = payloadFor(t);
    const b64 = encodePayload(payload);
    await page.goto(
      `${BASE_URL}/r/${encodeURIComponent(marketId)}/tier-${t.name}#r=${b64}`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForTimeout(1500);
    const polaroid = page.locator('svg[role="img"][aria-label^="Polaroid receipt"]').first();
    await polaroid.waitFor({ state: 'visible', timeout: 10000 });
    await polaroid.screenshot({ path: join(OUT_DIR, `tier-${t.name}.png`) });
    console.log(`✓ tier-${t.name}.png`);
  }

  await browser.close();
  console.log(`\nWrote ${TIERS.length} tier snapshots to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
