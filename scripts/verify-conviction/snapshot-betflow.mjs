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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Verify the polaroid and chart card render at IDENTICAL dimensions
  // AND that the form column ends at the same vertical position as the
  // visualisations column. The user explicitly asked for "same width
  // and height" in a column stack AND for the two halves of the page
  // to "end at the same height" — these assertions guard against
  // future regressions.
  const dims = await page.evaluate(() => {
    const aside = document.querySelector('aside[aria-label*="Live preview"]');
    const polaroid = aside?.querySelector('svg');
    const chartShell = aside?.querySelector('.conviction-chart-shell');
    const chartWrap = chartShell?.parentElement;
    // The form column is the first grid child (the div that contains
    // the H1 and the form fields, sibling of the aside).
    const formCol = aside?.parentElement?.firstElementChild;
    return {
      polaroidW: Math.round(polaroid?.getBoundingClientRect().width ?? 0),
      polaroidH: Math.round(polaroid?.getBoundingClientRect().height ?? 0),
      chartW: Math.round(chartWrap?.getBoundingClientRect().width ?? 0),
      chartH: Math.round(chartWrap?.getBoundingClientRect().height ?? 0),
      formH: Math.round(formCol?.getBoundingClientRect().height ?? 0),
      asideH: Math.round(aside?.getBoundingClientRect().height ?? 0),
    };
  });
  console.log('PREVIEW DIMS', JSON.stringify(dims));
  if (dims.polaroidW !== dims.chartW || dims.polaroidH !== dims.chartH) {
    throw new Error(`Polaroid and chart card dimensions must match. Got ${JSON.stringify(dims)}`);
  }
  if (Math.abs(dims.formH - dims.asideH) > 4) {
    throw new Error(`Form column and visualisations column must end at the same height. Got formH=${dims.formH}, asideH=${dims.asideH}`);
  }

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
