/**
 * Quick smoke check at a narrow viewport (1024) to confirm the form
 * column and the right-side aside still end at the same vertical
 * position when the right column is constrained more tightly.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = Number(process.env.VW ?? 1024);

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VIEWPORT, height: 1800 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

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
  console.log(`VIEWPORT ${VIEWPORT} DIMS`, JSON.stringify(dims));

  const expectedPolaroidH = Math.round(dims.polaroidW * 1.5);
  if (Math.abs(dims.polaroidH - expectedPolaroidH) > 2) {
    throw new Error(`Polaroid must keep a 1.5 portrait aspect ratio. Got ${dims.polaroidW}x${dims.polaroidH}.`);
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
  console.log('OK at viewport', VIEWPORT);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
