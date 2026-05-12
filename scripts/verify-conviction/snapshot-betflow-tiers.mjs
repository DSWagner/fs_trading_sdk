/**
 * Walk the prediction slider through values that map to each rarity tier
 * (relative to the current market's consensus), and snapshot the polaroid
 * each time. This is the live-preview equivalent of snapshot-rarity-tiers,
 * but tied to a real market so it actually exercises the full
 * effectiveRarity + rarityPalette pipeline (preview → potentialRarity).
 *
 * Expectations after the rewrite:
 *   - Each preview's sky is the tier's signature colour (cream -> jade ->
 *     azure -> violet -> gold -> ember), never randomized.
 *   - Star count: 1 / 2 / 4 / 5 / 6 / 7 for common / uncommon / rare /
 *     epic / legendary / mythic. Three is intentionally skipped (3-body
 *     problem); counts >= 4 are laid out as hierarchical pairs of
 *     binaries plus optional singletons.
 *   - Stars sit RANDOMLY in the upper-half sky (NOT pinned to prediction).
 *   - Reasoning quote, when visible (After Resolution preview), sits
 *     over the ground silhouette only — never over sky/sun/hills.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// For Tesla market: consensus 1373.8, range 0..5000.
// Tier mapping for the "After Resolution" preview (accuracy = 1 because
// previewOutcome = prediction). score = disagreement.
//   common    < 0.04        → prediction ~ consensus
//   uncommon  >= 0.04        → ~ 200 off
//   rare      >= 0.10        → ~ 500 off
//   epic      >= 0.18        → ~ 900 off
//   legendary >= 0.30        → ~ 1500 off
//   mythic    >= 0.45        → ~ 2300 off
const TIERS = [
  { name: 'common',    prediction: 1374 },
  { name: 'uncommon',  prediction: 1700 },
  { name: 'rare',      prediction: 2000 },
  { name: 'epic',      prediction: 2400 },
  { name: 'legendary', prediction: 3100 },
  { name: 'mythic',    prediction: 3950 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // Switch to "After Resolution" so the preview is fully developed and
  // reveals the reasoning quote over the ground.
  await page.getByRole('button', { name: /After resolution/i }).click();
  await page.waitForTimeout(400);

  for (const t of TIERS) {
    // Find the Prediction slider (first slider with label starting with
    // "Prediction" or "Center of range"). The value is controlled via
    // React state, so we set the value through the input's native setter
    // and dispatch the input event React listens to.
    await page.evaluate((value) => {
      const sliders = Array.from(document.querySelectorAll('input[type="range"]'));
      // The Prediction slider is the FIRST range input under the form
      // (after the Section "Shape the belief.").
      const predictionSlider = sliders[0];
      if (!predictionSlider) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(predictionSlider, String(value));
      predictionSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }, t.prediction);
    await page.waitForTimeout(600);
    const polaroid = page.locator('svg[role="img"][aria-label^="Polaroid receipt"]').first();
    await polaroid.waitFor({ state: 'visible', timeout: 5000 });
    await polaroid.screenshot({ path: join(OUT_DIR, `preview-tier-${t.name}.png`) });
    console.log(`✓ preview-tier-${t.name}.png (prediction=${t.prediction})`);
  }

  await browser.close();
  console.log(`\nWrote ${TIERS.length} preview-tier snapshots`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
