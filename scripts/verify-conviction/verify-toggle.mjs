// Verify the gallery now shows seven visually distinct palettes and the
// BetFlow has a working Before/After toggle.
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

console.log('1. Landing page palette gallery...');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('text=Seven palettes').scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
const galleryBox = await page.locator('text=Seven palettes').boundingBox();
await page.screenshot({
  path: join(SHOTS, 'gallery-developed.png'),
  clip: galleryBox ? { x: 0, y: galleryBox.y - 20, width: 1280, height: 540 } : undefined,
});

console.log('2. Open BetFlow and screenshot Before state...');
await page.goto('http://localhost:3000/discover', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const firstLink = page.locator('a[href^="/m/"]').first();
await firstLink.waitFor({ state: 'visible', timeout: 30000 });
await firstLink.click();
await page.waitForURL(/\/m\//, { timeout: 15000 });
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

const toggle = page.locator('button:has-text("Before resolution")');
await toggle.waitFor({ state: 'visible', timeout: 10000 });
console.log('   - toggle found');

const previewBoxBefore = await page.locator('aside').first().boundingBox();
if (previewBoxBefore) {
  await page.screenshot({
    path: join(SHOTS, 'betflow-before.png'),
    clip: {
      x: previewBoxBefore.x - 10,
      y: previewBoxBefore.y - 10,
      width: previewBoxBefore.width + 20,
      height: Math.min(700, previewBoxBefore.height + 20),
    },
  });
}

console.log('3. Click After resolution, wait for animation to finish...');
await page.locator('button:has-text("After resolution")').click();
await page.waitForTimeout(1200);

const previewBoxAfter = await page.locator('aside').first().boundingBox();
if (previewBoxAfter) {
  await page.screenshot({
    path: join(SHOTS, 'betflow-after.png'),
    clip: {
      x: previewBoxAfter.x - 10,
      y: previewBoxAfter.y - 10,
      width: previewBoxAfter.width + 20,
      height: Math.min(700, previewBoxAfter.height + 20),
    },
  });
}

console.log('4. Click back to Before for the diff side-by-side later...');
await page.locator('button:has-text("Before resolution")').click();
await page.waitForTimeout(400);

console.log('DONE.');
await browser.close();
