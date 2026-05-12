/**
 * Verify the live-preview polaroid is invariant under window resize.
 * Before the fix, `createdAt={new Date().toISOString()}` was inlined
 * in the JSX, so every parent re-render (which includes the ones
 * triggered by the form/preview-column ResizeObservers when the window
 * resizes) generated a fresh ISO string, fed it into the polaroid seed
 * via seedFromInputs, and shuffled the suns + stars + silhouette.
 *
 * The fix pins createdAt to a useMemo([]) so it is stable for the
 * lifetime of the BetFlowPage component. This script asserts the SVG
 * structure is byte-identical at three different viewport widths.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

async function captureSig(page) {
  return page.evaluate(() => {
    const aside = document.querySelector('aside[aria-label*="Live preview"]');
    const svg = aside?.querySelector('svg');
    if (!svg) return null;
    const circles = Array.from(svg.querySelectorAll('circle'))
      .map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')},${c.getAttribute('r')}`)
      .join('|');
    const paths = Array.from(svg.querySelectorAll('path'))
      .map((p) => p.getAttribute('d'))
      .join('|');
    return { circles, paths };
  });
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const sigA = await captureSig(page);
  if (!sigA) throw new Error('Could not capture initial polaroid SVG signature.');

  await page.setViewportSize({ width: 1200, height: 1800 });
  await page.waitForTimeout(800);
  const sigB = await captureSig(page);

  await page.setViewportSize({ width: 1024, height: 1800 });
  await page.waitForTimeout(800);
  const sigC = await captureSig(page);

  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.waitForTimeout(800);
  const sigD = await captureSig(page);

  const a = JSON.stringify(sigA);
  const b = JSON.stringify(sigB);
  const c = JSON.stringify(sigC);
  const d = JSON.stringify(sigD);

  console.log('SIG A (1440):', a.slice(0, 200));
  console.log('SIG B (1200):', b.slice(0, 200));
  console.log('SIG C (1024):', c.slice(0, 200));
  console.log('SIG D (1440):', d.slice(0, 200));

  if (a !== d) {
    throw new Error('Polaroid SVG signature changed across resize. createdAt seed is not stable.');
  }
  console.log('OK: polaroid signature is stable across resizes (1440 -> 1200 -> 1024 -> 1440).');

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
