// Empirically verify the BetFlow sliders look professional in a real browser
// after the styling overhaul, and that the page is stable (no infinite render
// loop). Writes screenshots to ./screenshots/slider-*.png.
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

console.log('1. Navigating to discover...');
await page.goto('http://localhost:3000/discover', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Click the first market card to enter BetFlow. We use the "Stake my conviction"
// link/button pattern from the discover card.
console.log('2. Opening first market...');
const firstLink = page.locator('a[href^="/m/"]').first();
await firstLink.waitFor({ state: 'visible', timeout: 30000 });
await firstLink.click();
await page.waitForURL(/\/m\//, { timeout: 15000 });
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);

console.log('3. Confirming a slider rendered...');
const sliderCount = await page.locator('.conviction-slider').count();
console.log(`   - found ${sliderCount} sliders with class .conviction-slider`);
if (sliderCount < 3) {
  throw new Error(`expected at least 3 sliders, got ${sliderCount}`);
}

console.log('4. Measuring slider track height + thumb to check styling took effect...');
const trackHeight = await page.locator('.conviction-slider').first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { width: Math.round(r.width), height: Math.round(r.height) };
});
console.log(`   - first slider bbox: ${JSON.stringify(trackHeight)}`);

console.log('5. Checking page stability over 3 seconds (no infinite loop)...');
const initialNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
await page.waitForTimeout(3000);
const laterNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
console.log(`   - dom node count: ${initialNodeCount} -> ${laterNodeCount}`);
if (Math.abs(laterNodeCount - initialNodeCount) > 50) {
  console.log('   ! WARNING: dom is changing rapidly, possibly a loop');
}

console.log('6. Full-page screenshot of BetFlow...');
await page.screenshot({ path: join(SHOTS, 'slider-betflow-full.png'), fullPage: true });

console.log('7. Crop screenshot of just the sliders area...');
const sliderRegion = await page.locator('.conviction-slider').first().boundingBox();
if (sliderRegion) {
  await page.screenshot({
    path: join(SHOTS, 'slider-closeup.png'),
    clip: {
      x: Math.max(0, sliderRegion.x - 20),
      y: Math.max(0, sliderRegion.y - 80),
      width: Math.min(900, sliderRegion.width + 40),
      height: 480,
    },
  });
}

console.log('\nDONE. Screenshots in scripts/verify-conviction/screenshots/');
await browser.close();
