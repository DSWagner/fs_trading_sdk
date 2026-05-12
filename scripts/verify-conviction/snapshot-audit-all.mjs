/**
 * Professional audit pass: capture every public page in both light and
 * dark modes at the canonical desktop viewport (1440 wide, tall enough
 * to never need to scroll for the snapshot). The output goes into
 * snapshots/audit/{mode}-{page}.png so the assistant can scrutinize
 * each page and identify alignment / spacing / edge issues.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots', 'audit');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  const dimsLog = [];

  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 2200 } });
    const page = await ctx.newPage();
    await page.addInitScript((m) => {
      try {
        window.localStorage.setItem('conviction.theme', m);
      } catch {}
    }, mode);

    const visit = async (path, name, extraWaitMs = 800) => {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(extraWaitMs);
      await page.evaluate((m) => {
        if (m === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
      }, mode);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT_DIR, `${mode}-${name}.png`), fullPage: true });
      console.log(`  saved ${mode}-${name}.png`);
    };

    console.log(`MODE: ${mode}`);
    await visit('/', 'landing');
    await visit('/discover', 'discover', 3000);
    await visit('/explore', 'explore', 1500);
    await visit('/about', 'about');

    // BetFlow page: discover then click first market.
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    const firstMarket = page.locator('a[href^="/m/"]').first();
    await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
    const href = await firstMarket.getAttribute('href');
    await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.evaluate((m) => {
      if (m === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    }, mode);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT_DIR, `${mode}-betflow.png`), fullPage: true });
    console.log(`  saved ${mode}-betflow.png`);

    // Capture detailed BetFlow column dimensions for alignment analysis.
    const dims = await page.evaluate(() => {
      const grab = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          bottom: Math.round(r.bottom),
        };
      };
      return {
        formCol: grab('[data-betflow-form]'),
        formInner: grab('[data-betflow-form-inner]'),
        aside: grab('[data-betflow-aside]'),
        polaroid: grab('[data-betflow-polaroid]'),
        chart: grab('[data-betflow-chart]'),
        cta: grab('[data-betflow-cta]'),
        authCard: grab('[data-betflow-auth]'),
      };
    });
    dimsLog.push({ mode, dims });

    await ctx.close();
  }
  await browser.close();
  await writeFile(join(OUT_DIR, 'dims.json'), JSON.stringify(dimsLog, null, 2));
  console.log('Wrote dims.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
