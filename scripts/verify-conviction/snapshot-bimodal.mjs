/**
 * Snapshot the polaroid at controlled inputs via the Receipt page's
 * share-payload hash (#r=<base64>). Gives us deterministic inputs so we
 * can eyeball whether the bimodal suns land over the hills and whether
 * the stake-driven ornament strip is visibly different at $1, $50, $999.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

function encodePayload(p) {
  const json = JSON.stringify(p);
  const utf8 = unescape(encodeURIComponent(json));
  return Buffer.from(utf8, 'binary').toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function snap(page, label, payload, marketId) {
  const b64 = encodePayload(payload);
  await page.goto(`${BASE_URL}/r/${encodeURIComponent(marketId)}/${encodeURIComponent(`snap-${label}`)}#r=${b64}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const polaroid = page.locator('svg[role="img"][aria-label^="Polaroid receipt"]').first();
  await polaroid.waitFor({ state: 'visible', timeout: 8000 });
  await polaroid.screenshot({ path: join(OUT_DIR, `${label}.png`) });
  console.log(`[snap] ${label}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  const marketId = href.replace('/m/', '');

  const base = {
    reasoning: 'Testing the visual semantics of the polaroid.',
    username: 'verifier',
    createdAt: new Date().toISOString(),
    marketTitle: 'Test Market',
    consensusAtBet: 2500,
  };

  // Single peak at three stakes.
  for (const stake of [1, 50, 999]) {
    await snap(page, `single-stake-${stake}`, {
      ...base,
      prediction: 2500,
      spread: 300,
      conviction: 0.7,
      collateral: stake,
      shape: 'gaussian',
    }, marketId);
  }

  // Bimodal at three spreads — suns should track the two density peaks.
  for (const spread of [200, 600, 1100]) {
    await snap(page, `bimodal-spread-${spread}`, {
      ...base,
      prediction: 2500,
      spread,
      conviction: 0.7,
      collateral: 100,
      shape: 'bimodal',
    }, marketId);
  }

  // Range at heavy stake — plateau hill, sun centered, visible ornaments.
  await snap(page, 'range-heavy', {
    ...base,
    prediction: 2500,
    spread: 600,
    conviction: 0.6,
    collateral: 750,
    shape: 'range',
  }, marketId);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
