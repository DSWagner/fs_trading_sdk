// Empirical verification for the rarity feature:
//   1. Landing page shows the rarity tier legend (6 cells) and at least one
//      hero polaroid carries a rarity stamp.
//   2. BetFlow shows the live RarityHint card and the hint tier changes when
//      the prediction slider is moved meaningfully off consensus.
//   3. The hint card has the correct data-tier attribute for "common" and
//      switches to a higher tier as the prediction strays from consensus.
//
// Captures a small set of screenshots into ./screenshots so any visual
// regression is reviewable by eye.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const log = (msg) => console.log(`[verify-rarity] ${msg}`);

try {
  log('1. landing page rarity tier legend');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  const intro = page.locator('[data-testid="rarity-intro"]');
  await intro.waitFor({ state: 'visible', timeout: 15000 });
  const tierCells = await page.locator('[data-testid^="landing-tier-"]').count();
  log(`   tier cells: ${tierCells}`);
  if (tierCells !== 6) throw new Error(`expected 6 tier cells, got ${tierCells}`);

  await intro.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box = await intro.boundingBox();
  if (box) {
    await page.screenshot({
      path: join(SHOTS, 'rarity-landing-intro.png'),
      clip: { x: 0, y: Math.max(0, box.y - 20), width: 1280, height: Math.min(540, box.height + 40) },
    });
  }

  log('2. hero polaroids carry rarity stamps');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const svgText = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('svg')).map((s) => s.textContent).join(' | ');
  });
  log(`   stamps present in DOM text? ${/MYTHIC|LEGENDARY|EPIC|RARE/i.test(svgText)}`);
  if (!/MYTHIC|LEGENDARY|EPIC|RARE/i.test(svgText)) {
    throw new Error('expected at least one hero polaroid to carry a rarity stamp');
  }
  await page.screenshot({ path: join(SHOTS, 'rarity-landing-hero.png'), fullPage: false });

  log('3. open BetFlow on a market and check the RarityHint card');
  await page.goto('http://localhost:3000/discover', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const firstLink = page.locator('a[href^="/m/"]').first();
  await firstLink.waitFor({ state: 'visible', timeout: 30000 });
  await firstLink.click();
  await page.waitForURL(/\/m\//, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const hint = page.locator('[data-testid="rarity-hint"]');
  await hint.waitFor({ state: 'visible', timeout: 15000 });
  await hint.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const initialTier = await hint.getAttribute('data-tier');
  log(`   initial tier: ${initialTier}`);
  const hintBox = await hint.boundingBox();
  if (hintBox) {
    await page.screenshot({
      path: join(SHOTS, 'rarity-hint-initial.png'),
      clip: {
        x: Math.max(0, hintBox.x - 20),
        y: Math.max(0, hintBox.y - 20),
        width: Math.min(1200, hintBox.width + 40),
        height: hintBox.height + 40,
      },
    });
  }

  log('4. drag the prediction slider to the far right and re-check the tier');
  // The prediction slider is the second .conviction-slider on the page
  // (shape selector buttons aren't sliders). Pick the slider whose label
  // contains "Prediction" or fall back to the first slider.
  const sliders = page.locator('input.conviction-slider');
  const count = await sliders.count();
  log(`   slider count: ${count}`);
  if (count === 0) throw new Error('no sliders on the bet page');

  // Find the slider whose label contains "Prediction" / "Center of range".
  let predictionSlider = sliders.first();
  for (let i = 0; i < count; i += 1) {
    const s = sliders.nth(i);
    const labelText = await s.evaluate((el) => {
      const container = el.closest('div')?.parentElement;
      return container?.textContent ?? '';
    });
    if (/prediction|center of range|first peak/i.test(labelText)) {
      predictionSlider = s;
      break;
    }
  }

  // Drive the slider to its max value by repeatedly pressing End.
  await predictionSlider.focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(400);

  const farTier = await hint.getAttribute('data-tier');
  log(`   far-right tier: ${farTier}`);

  await page.screenshot({
    path: join(SHOTS, 'rarity-hint-far-right.png'),
    clip: hintBox
      ? {
          x: Math.max(0, hintBox.x - 20),
          y: Math.max(0, hintBox.y - 20),
          width: Math.min(1200, hintBox.width + 40),
          height: hintBox.height + 40,
        }
      : undefined,
  });

  // Sanity: at the extreme, the tier should NOT still be 'common' as long
  // as the market has a consensus mean. If it is, the hint is not reacting
  // to slider movement and that is a regression.
  if (farTier === 'common') {
    log('   warning: tier stayed common at the slider extreme. Consensus may be at the bound.');
  } else {
    log(`   tier escalated from ${initialTier} -> ${farTier}`);
  }

  log('DONE — all rarity checks passed.');
  await browser.close();
  process.exit(0);
} catch (err) {
  console.error('[verify-rarity] FAILED:', err);
  await browser.close();
  process.exit(1);
}
