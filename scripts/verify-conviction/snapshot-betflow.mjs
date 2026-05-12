/**
 * Open BetFlow at desktop width and snapshot the sticky right column.
 * The right aside now renders TWO polaroids side-by-side ("before" on
 * the left, fully developed "after" on the right) plus the chart below.
 * This script verifies:
 *   1. Each polaroid keeps the 1.5 portrait aspect ratio.
 *   2. The chart fills (almost) the full aside width.
 *   3. The form column and the aside end at the same vertical position.
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
    const beforeCard = aside?.querySelector('[data-betflow-polaroid="before"]');
    const afterCard = aside?.querySelector('[data-betflow-polaroid="after"]');
    const beforeSvg = beforeCard?.querySelector('svg');
    const afterSvg = afterCard?.querySelector('svg');
    const chartShell = aside?.querySelector('.conviction-chart-shell');
    const chartWrap = chartShell?.parentElement;
    const formCol = aside?.parentElement?.firstElementChild;
    return {
      beforeW: Math.round(beforeSvg?.getBoundingClientRect().width ?? 0),
      beforeH: Math.round(beforeSvg?.getBoundingClientRect().height ?? 0),
      afterW: Math.round(afterSvg?.getBoundingClientRect().width ?? 0),
      afterH: Math.round(afterSvg?.getBoundingClientRect().height ?? 0),
      chartW: Math.round(chartWrap?.getBoundingClientRect().width ?? 0),
      chartH: Math.round(chartWrap?.getBoundingClientRect().height ?? 0),
      asideW: Math.round(aside?.getBoundingClientRect().width ?? 0),
      formH: Math.round(formCol?.getBoundingClientRect().height ?? 0),
      asideH: Math.round(aside?.getBoundingClientRect().height ?? 0),
    };
  });
  console.log('PREVIEW DIMS', JSON.stringify(dims));
  for (const which of ['before', 'after']) {
    const w = dims[`${which}W`];
    const h = dims[`${which}H`];
    const expectedH = Math.round(w * 1.5);
    if (Math.abs(h - expectedH) > 2) {
      throw new Error(`${which} polaroid must keep a 1.5 portrait aspect ratio. Got ${w}x${h}, expected height ~${expectedH}.`);
    }
  }
  if (Math.abs(dims.beforeW - dims.afterW) > 2) {
    throw new Error(`Before and after polaroids must have the same width. Got ${dims.beforeW} vs ${dims.afterW}.`);
  }
  if (dims.chartW <= dims.beforeW) {
    throw new Error(`Chart should be wider than a single polaroid. Got chartW=${dims.chartW}, polaroidW=${dims.beforeW}.`);
  }
  if (dims.chartW < dims.asideW * 0.95) {
    throw new Error(`Chart should fill (most of) the aside width. Got chartW=${dims.chartW}, asideW=${dims.asideW}.`);
  }
  if (Math.abs(dims.formH - dims.asideH) > 4) {
    throw new Error(`Form column and visualisations column must end at the same height. Got formH=${dims.formH}, asideH=${dims.asideH}`);
  }

  await page.screenshot({ path: join(OUT_DIR, 'betflow-pair.png'), fullPage: false });

  // Wait for the "after" polaroid develop animation to finish (~1.6s).
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(OUT_DIR, 'betflow-pair-developed.png'), fullPage: false });

  // Scroll halfway through the form and snapshot again to confirm the
  // sticky right column stays put with both polaroids + chart visible.
  await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'instant' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, 'betflow-pair-scrolled.png'), fullPage: false });

  await browser.close();
  console.log(`Saved 3 screenshots to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
