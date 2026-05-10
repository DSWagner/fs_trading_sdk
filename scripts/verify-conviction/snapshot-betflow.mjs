/**
 * Open BetFlow at desktop width and snapshot the sticky right column +
 * the polaroid in "after resolution" preview mode. Confirms the chart
 * is the same width as the polaroid, no inner scrollbar, and the
 * "after" preview shows a developed (sharp, colored) receipt regardless
 * of the slider values.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: join(OUT_DIR, 'betflow-before.png'), fullPage: false });

  const afterBtn = page.getByRole('button', { name: /After resolution/i });
  await afterBtn.click();
  await page.waitForTimeout(1200);

  await page.screenshot({ path: join(OUT_DIR, 'betflow-after.png'), fullPage: false });

  // Scroll halfway through the form and snapshot again — confirms sticky
  // right column stays put with polaroid + chart still both visible.
  await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'instant' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, 'betflow-after-scrolled.png'), fullPage: false });

  await browser.close();
  console.log(`Saved 3 screenshots to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
