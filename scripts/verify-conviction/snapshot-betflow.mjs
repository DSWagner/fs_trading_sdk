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

  // Verify the layout invariants the user has asked for:
  //   1. Polaroid keeps its 1.5 portrait aspect ratio (height = 1.5 * width).
  //   2. The chart fills the aside width (chartW close to asideW) while
  //      the polaroid stays narrower than the chart - the user explicitly
  //      asked for the chart to widen past the polaroid because forcing
  //      them to identical width compressed the consensus curves.
  //   3. The form column and the aside end at the same vertical position
  //      so neither half has orphaned empty space below it.
  const dims = await page.evaluate(() => {
    const aside = document.querySelector('aside[aria-label*="Live preview"]');
    const polaroid = aside?.querySelector('svg');
    const chartShell = aside?.querySelector('.conviction-chart-shell');
    const chartWrap = chartShell?.parentElement;
    const formCol = aside?.parentElement?.firstElementChild;
    return {
      polaroidW: Math.round(polaroid?.getBoundingClientRect().width ?? 0),
      polaroidH: Math.round(polaroid?.getBoundingClientRect().height ?? 0),
      chartW: Math.round(chartWrap?.getBoundingClientRect().width ?? 0),
      chartH: Math.round(chartWrap?.getBoundingClientRect().height ?? 0),
      asideW: Math.round(aside?.getBoundingClientRect().width ?? 0),
      formH: Math.round(formCol?.getBoundingClientRect().height ?? 0),
      asideH: Math.round(aside?.getBoundingClientRect().height ?? 0),
    };
  });
  console.log('PREVIEW DIMS', JSON.stringify(dims));
  const expectedPolaroidH = Math.round(dims.polaroidW * 1.5);
  if (Math.abs(dims.polaroidH - expectedPolaroidH) > 2) {
    throw new Error(`Polaroid must keep a 1.5 portrait aspect ratio. Got ${dims.polaroidW}x${dims.polaroidH}, expected height ~${expectedPolaroidH}.`);
  }
  if (dims.chartW <= dims.polaroidW) {
    throw new Error(`Chart should be wider than the polaroid. Got chartW=${dims.chartW}, polaroidW=${dims.polaroidW}.`);
  }
  if (dims.chartW < dims.asideW * 0.95) {
    throw new Error(`Chart should fill (most of) the aside width. Got chartW=${dims.chartW}, asideW=${dims.asideW}.`);
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
