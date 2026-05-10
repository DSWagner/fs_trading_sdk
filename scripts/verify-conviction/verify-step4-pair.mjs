// Empirical check that the consensus chart (Step 4) and the live polaroid
// preview are visible at the same time, on both desktop and mobile viewports.
//
//   Desktop: the sticky right-aside polaroid must overlap vertically with the
//            consensus chart when the user scrolls to Step 4.
//   Mobile:  Step 4 must render its OWN inline polaroid above the chart, so
//            the user never has to scroll back up.
//
// Captures screenshots into ./screenshots for visual confirmation.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const log = (msg) => console.log(`[verify-step4] ${msg}`);

const browser = await chromium.launch();

async function navToFirstMarket(page) {
  await page.goto('http://localhost:3000/discover', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const firstLink = page.locator('a[href^="/m/"]').first();
  await firstLink.waitFor({ state: 'visible', timeout: 30000 });
  await firstLink.click();
  await page.waitForURL(/\/m\//, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function rectsOverlap(page, a, b) {
  const boxA = await a.boundingBox();
  const boxB = await b.boundingBox();
  if (!boxA || !boxB) return false;
  const vertOverlap =
    Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y);
  return vertOverlap > 80; // at least 80px of vertical overlap
}

try {
  // ---------- DESKTOP ----------
  log('1. DESKTOP 1280x900 — open BetFlow, scroll to Step 4');
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dPage = await desktopCtx.newPage();
  await navToFirstMarket(dPage);

  const consensusHeading = dPage.locator('text=See the consensus you\'re betting against').first();
  await consensusHeading.waitFor({ state: 'visible', timeout: 15000 });
  await consensusHeading.scrollIntoViewIfNeeded();
  await dPage.waitForTimeout(800);

  const desktopAside = dPage.locator('aside[aria-label="Live preview of your receipt"]');
  await desktopAside.waitFor({ state: 'visible', timeout: 5000 });
  const chartShell = dPage.locator('.conviction-chart-shell').first();
  await chartShell.waitFor({ state: 'visible', timeout: 5000 });

  const asideBox = await desktopAside.boundingBox();
  const chartBox = await chartShell.boundingBox();
  log(`   aside box: top=${asideBox?.y?.toFixed(0)} h=${asideBox?.height?.toFixed(0)}`);
  log(`   chart box: top=${chartBox?.y?.toFixed(0)} h=${chartBox?.height?.toFixed(0)}`);

  const overlapDesktop = await rectsOverlap(dPage, desktopAside, chartShell);
  log(`   chart and sticky aside visible together? ${overlapDesktop}`);
  if (!overlapDesktop) {
    throw new Error('desktop: sticky polaroid does not overlap with chart vertically while at Step 4');
  }

  await dPage.screenshot({ path: join(SHOTS, 'step4-desktop-pair.png'), fullPage: false });
  await desktopCtx.close();

  // ---------- MOBILE ----------
  log('2. MOBILE 390x844 — open BetFlow, scroll to Step 4');
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mPage = await mobileCtx.newPage();
  await navToFirstMarket(mPage);

  // Use document-level scrolling and DOM-level geometry queries; element-
  // level scrollIntoViewIfNeeded fights the develop animation's layout shifts.
  await mPage.waitForSelector('.conviction-chart-shell', { timeout: 15000 });
  await mPage.waitForSelector('text=YOUR RECEIPT (LIVE)', { timeout: 15000 });
  await mPage.waitForTimeout(1200);

  // Scroll the chart into view by using window.scrollTo with the chart's
  // absolute Y offset.
  const chartAbsY = await mPage.evaluate(() => {
    const el = document.querySelector('.conviction-chart-shell');
    if (!el) return null;
    return window.scrollY + el.getBoundingClientRect().top;
  });
  if (chartAbsY == null) throw new Error('mobile: could not find chart in DOM');
  // Position the chart slightly below the top so the inline polaroid above
  // it remains in view.
  await mPage.evaluate((y) => window.scrollTo({ top: y - 200, behavior: 'instant' }), chartAbsY);
  await mPage.waitForTimeout(700);

  const geometry = await mPage.evaluate(() => {
    const chart = document.querySelector('.conviction-chart-shell');
    const eyebrows = Array.from(document.querySelectorAll('*')).filter(
      (n) => n.textContent && n.textContent.trim() === 'YOUR RECEIPT (LIVE)',
    );
    const eyebrow = eyebrows[0];
    if (!chart || !eyebrow) return null;
    const cb = chart.getBoundingClientRect();
    const eb = eyebrow.getBoundingClientRect();
    return {
      chartTop: cb.top,
      chartBottom: cb.bottom,
      eyebrowTop: eb.top,
      eyebrowBottom: eb.bottom,
      vh: window.innerHeight,
    };
  });
  log(`   mobile geometry: ${JSON.stringify(geometry)}`);
  if (!geometry) throw new Error('mobile: could not measure geometry');

  // After our compact-thumbnail refactor, the inline preview is ~310px tall
  // and the chart is ~525px tall, so both should comfortably fit in an
  // 844px viewport at the same time when we scroll them together.
  // Re-position scroll so the inline preview's TOP is just below the
  // navbar (~70px), then re-measure.
  const inlineAbsY = await mPage.evaluate(() => {
    const eyebrows = Array.from(document.querySelectorAll('*')).filter(
      (n) => n.textContent && n.textContent.trim() === 'YOUR RECEIPT (LIVE)',
    );
    if (eyebrows.length === 0) return null;
    return window.scrollY + eyebrows[0].getBoundingClientRect().top;
  });
  if (inlineAbsY == null) throw new Error('mobile: could not find inline preview in DOM');
  await mPage.evaluate((y) => window.scrollTo({ top: y - 60, behavior: 'instant' }), inlineAbsY);
  await mPage.waitForTimeout(500);

  const both = await mPage.evaluate(() => {
    const chart = document.querySelector('.conviction-chart-shell');
    const eyebrows = Array.from(document.querySelectorAll('*')).filter(
      (n) => n.textContent && n.textContent.trim() === 'YOUR RECEIPT (LIVE)',
    );
    const eyebrow = eyebrows[0];
    if (!chart || !eyebrow) return null;
    const cb = chart.getBoundingClientRect();
    const eb = eyebrow.getBoundingClientRect();
    return {
      chartTop: cb.top,
      chartBottom: cb.bottom,
      eyebrowTop: eb.top,
      vh: window.innerHeight,
      chartInView: cb.top < window.innerHeight && cb.bottom > 0,
      eyebrowInView: eb.top < window.innerHeight && eb.top + 14 > 0,
    };
  });
  log(`   after scroll-to-preview: ${JSON.stringify(both)}`);

  if (!both?.eyebrowInView) {
    throw new Error('mobile: inline preview eyebrow is NOT in the viewport');
  }
  if (!both?.chartInView) {
    throw new Error('mobile: chart is NOT in the viewport when the inline preview is anchored at top');
  }

  await mPage.screenshot({ path: join(SHOTS, 'step4-mobile-pair.png'), fullPage: false });
  await mPage.screenshot({ path: join(SHOTS, 'step4-mobile-fullpage.png'), fullPage: true });

  await mobileCtx.close();

  log('DONE — both desktop and mobile keep chart + polaroid visible together at Step 4.');
  await browser.close();
  process.exit(0);
} catch (err) {
  console.error('[verify-step4] FAILED:', err);
  await browser.close();
  process.exit(1);
}
