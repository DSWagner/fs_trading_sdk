/**
 * Capture light and dark mode snapshots of BetFlow for visual review.
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
  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
    const page = await ctx.newPage();
    await page.addInitScript((m) => {
      try {
        window.localStorage.setItem('conviction.theme', m);
      } catch {}
    }, mode);
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    const firstMarket = page.locator('a[href^="/m/"]').first();
    await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
    const href = await firstMarket.getAttribute('href');
    await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Force theme attribute as a belt-and-braces in case the storage key
    // does not match the bootstrap script.
    await page.evaluate((m) => {
      if (m === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    }, mode);
    await page.waitForTimeout(400);

    await page.screenshot({ path: join(OUT_DIR, `betflow-${mode}.png`), fullPage: false });
    console.log(`saved betflow-${mode}.png`);
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
