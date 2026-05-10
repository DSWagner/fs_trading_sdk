/**
 * Capture: (1) the live Receipt page screenshot in both themes, and
 * (2) the actual downloaded PNG file written to disk. Lets us eyeball
 * the new SVG caption.
 */
import { chromium } from 'playwright';
import { mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

async function runMode(browser, mode) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  const currentMode = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light');
  if (currentMode !== mode) {
    await page.getByTestId('dark-mode-toggle').click();
    await page.waitForTimeout(150);
  }

  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  const marketId = href.replace('/m/', '');

  const payload = {
    reasoning:
      'Cars will keep getting smarter and lithium will keep getting cheaper. The only question is who blinks first.',
    username: 'verifier',
    prediction: 50,
    spread: 5,
    conviction: 0.8,
    collateral: 25,
    shape: 'gaussian',
    createdAt: new Date().toISOString(),
    marketTitle: 'Test Market',
    consensusAtBet: 30,
  };
  const json = JSON.stringify(payload);
  const utf8 = unescape(encodeURIComponent(json));
  const b64 = Buffer.from(utf8, 'binary').toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  await page.goto(`${BASE_URL}/r/${encodeURIComponent(marketId)}/snap-${mode}#r=${b64}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const polaroid = page.locator('svg[role="img"][aria-label^="Polaroid receipt"]').first();
  await polaroid.waitFor({ state: 'visible', timeout: 10000 });

  await polaroid.screenshot({ path: join(OUT_DIR, `polaroid-${mode}-live.png`) });

  const dlBtn = page.getByRole('button', { name: /Download as PNG/i });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    dlBtn.click(),
  ]);
  const tmp = await download.path();
  await copyFile(tmp, join(OUT_DIR, `polaroid-${mode}-export.png`));
  console.log(`✓ [${mode}] live screenshot + exported PNG saved`);
  await ctx.close();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  await runMode(browser, 'light');
  await runMode(browser, 'dark');
  await browser.close();
  console.log(`\nFiles written to: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
