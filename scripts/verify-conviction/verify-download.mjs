/**
 * Verifies the polaroid download produces a non-empty PNG in both light
 * and dark modes. Catches the CSS-variable-resolution regression that
 * silently produced blank receipts after the dark mode refactor.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

async function runMode(browser, mode) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error(`PAGE ERROR (${mode}): ${err.message}`));

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  // Apply theme via the toggle if needed.
  const currentMode = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light');
  if (currentMode !== mode) {
    await page.getByTestId('dark-mode-toggle').click();
    await page.waitForTimeout(200);
  }
  const live = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light');
  console.log(`[${mode}] theme is ${live}`);

  // Hit Discover, pick the first market, sign in not required for read-only
  // — we'll synthesize a receipt via the share-hash flow on /r/:m/:p.
  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  const marketId = href.replace('/m/', '');

  // Build a synthetic share-payload + URL hash that loads on the receipt page.
  // We use a fake positionId; the Receipt page hydrates from `#r=<base64>`
  // when local storage has no record for that ID.
  const payload = {
    reasoning: 'A test receipt for download verification — should render and be exportable.',
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
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning' || t === 'log') {
      console.log(`[${mode}][${t}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => console.log(`[${mode}][page-error] ${err.message}`));
  await page.goto(`${BASE_URL}/r/${encodeURIComponent(marketId)}/test-pos-1#r=${b64}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Wait for the polaroid to actually render before clicking download.
  const polaroid = page.locator('svg[role="img"][aria-label^="Polaroid receipt"]').first();
  await polaroid.waitFor({ state: 'visible', timeout: 10000 });

  // Find the download button.
  const dlBtn = page.getByRole('button', { name: /Download as PNG/i });
  await dlBtn.waitFor({ state: 'visible', timeout: 8000 });

  // Listen for the download.
  let downloadErr = null;
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch((e) => { downloadErr = e; return null; }),
    dlBtn.click(),
  ]);
  if (!download) {
    const state = await dlBtn.textContent();
    console.error(`[${mode}] download did not fire. Button state: "${state}". Err: ${downloadErr?.message ?? 'none'}`);

    // Drill deeper: check what state the polaroid container is in.
    const diag = await page.evaluate(() => {
      const svg = document.querySelector('svg[role="img"][aria-label^="Polaroid receipt"]');
      if (!svg) return { hasSvg: false };
      const container = svg.parentElement;
      return {
        hasSvg: true,
        svgWidth: svg.getAttribute('width'),
        svgHeight: svg.getAttribute('height'),
        containerTag: container?.tagName,
      };
    });
    console.log(`[${mode}] polaroid state:`, diag);
    return false;
  }
  const path = await download.path();
  const fs = await import('node:fs');
  const stat = fs.statSync(path);
  console.log(`[${mode}] download size: ${stat.size} bytes`);

  // 8 KB minimum is a sane floor; even a tiny polaroid serializes to far more.
  if (stat.size < 8 * 1024) {
    console.error(`✗ [${mode}] PNG is too small (${stat.size}B) — probably blank.`);
    return false;
  }

  // Verify it actually parses as PNG.
  const buf = fs.readFileSync(path);
  const isPNG = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!isPNG) {
    console.error(`✗ [${mode}] file is not a valid PNG`);
    return false;
  }
  console.log(`✓ [${mode}] valid PNG, ${stat.size} bytes`);

  await ctx.close();
  return true;
}

async function main() {
  const browser = await chromium.launch();
  const lightOk = await runMode(browser, 'light');
  const darkOk = await runMode(browser, 'dark');
  await browser.close();
  if (!lightOk || !darkOk) process.exit(1);
  console.log('\n✓ download produces valid non-empty PNG in both themes');
}

main().catch((err) => {
  console.error('verifier crashed:', err);
  process.exit(1);
});
