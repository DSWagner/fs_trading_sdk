/**
 * Capture a Receipt page in light + dark to confirm the polaroid bleed
 * fix and number formatting hold up on the page the user actually
 * shared in the original screenshot.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots', 'audit');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
    const page = await ctx.newPage();
    await page.addInitScript((m) => {
      try {
        window.localStorage.setItem('conviction.theme', m);
      } catch {}
    }, mode);

    // Discover -> first market -> sign in -> stake -> redirect to receipt.
    // For audit we just visit a known receipt path (a stub one) and rely
    // on the Receipt component to render an editorial state when the
    // bet does not resolve. Use a hash that loads from any local bet.
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const firstMarket = page.locator('a[href^="/m/"]').first();
    if (await firstMarket.isVisible()) {
      const href = await firstMarket.getAttribute('href');
      const marketId = href?.replace('/m/', '');
      if (marketId) {
        // Visit a placeholder receipt URL. The Receipt page has an
        // editorial "no record found" view if the id is unknown but we
        // can still capture the layout chrome.
        await page.goto(`${BASE_URL}/r/${marketId}_pos_test`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
      }
    }

    await page.evaluate((m) => {
      if (m === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    }, mode);
    await page.waitForTimeout(400);

    await page.screenshot({ path: join(OUT_DIR, `${mode}-receipt.png`), fullPage: true });
    console.log(`saved ${mode}-receipt.png`);
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
