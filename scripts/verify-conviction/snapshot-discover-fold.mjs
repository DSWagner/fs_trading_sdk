/**
 * Captures the Discover page at the viewport-only (above the fold) so
 * we can inspect the visual quality of the first batch of market
 * cards without scrolling through the entire list.
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
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((m) => {
      try { window.localStorage.setItem('conviction.theme', m); } catch {}
    }, mode);
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.evaluate((m) => {
      if (m === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    }, mode);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT_DIR, `${mode}-discover-fold.png`), fullPage: false });
    console.log(`saved ${mode}-discover-fold.png`);
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
