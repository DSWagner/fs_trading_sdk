/**
 * Render a 6 × 6 grid of polaroids that only differ by their positionId
 * and a couple of slider values, in the fully-resolved + accurate state
 * so the develop filter is off and the procedural palettes show their
 * actual colors. With table-driven palettes the grid would band into
 * ~16 distinct skies on repeat; with procedural palettes every tile
 * should look unique across the full HSL spectrum.
 *
 * Strategy: plant 36 distinct resolved BetRecords into localStorage
 * under a synthetic user, then visit /u/<user> (the Profile page),
 * which renders one Polaroid per record. Screenshot each tile and
 * stitch them into a mosaic for visual inspection.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();

  // Pick any real market id for the records to point at.
  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const marketId = (await firstMarket.getAttribute('href')).replace('/m/', '');

  const records = Array.from({ length: 36 }, (_, i) => {
    const prediction = 5 + ((i * 7) % 90);
    return {
      marketId,
      positionId: `palette-grid-${i}`,
      username: 'palette-spread',
      reasoning: `Sample reasoning #${i}. Just here to demonstrate palette spread.`,
      prediction,
      spread: 3 + (i * 3) % 9,
      conviction: 0.25 + ((i * 0.17) % 0.7),
      collateral: 5 + i * 3,
      shape: i % 3 === 0 ? 'gaussian' : i % 3 === 1 ? 'range' : 'bimodal',
      createdAt: new Date(Date.UTC(2024, 0, 1 + i, 12)).toISOString(),
      expiresAt: new Date(Date.UTC(2025, 0, 1, 12)).toISOString(),
      marketTitle: 'Procedural palette spread',
      consensusAtBet: 50,
      resolutionState: 'resolved',
      resolvedOutcome: prediction, // perfect accuracy → fully developed
      lowerBound: 0,
      upperBound: 100,
      marketUnits: '%',
    };
  });

  await page.evaluate((recs) => {
    localStorage.setItem('conviction.v1', JSON.stringify({ bets: recs }));
  }, records);

  await page.goto(`${BASE_URL}/u/palette-spread`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const polaroids = page.locator('svg[role="img"][aria-label^="Polaroid receipt"]');
  const count = await polaroids.count();
  console.log(`Profile rendered ${count} polaroids`);

  const colors = [];
  const thumbnails = [];
  for (let i = 0; i < count; i++) {
    const node = polaroids.nth(i);
    const stop = await node.evaluate((svg) => {
      const s = svg.querySelector('linearGradient[id^="sky-"] stop');
      return s ? s.getAttribute('stop-color') : null;
    });
    colors.push(stop);
    const buf = await node.screenshot();
    thumbnails.push(buf.toString('base64'));
  }

  const html = `
<!DOCTYPE html><meta charset="utf-8">
<style>
  body { margin: 0; padding: 24px; background: #1A1A1A; font-family: monospace; color: #fff; }
  h1 { font-size: 14px; opacity: 0.7; margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
  .cell { background: #000; border-radius: 4px; overflow: hidden; }
  .cell img { display: block; width: 100%; height: auto; }
  .swatch { display:flex; align-items:center; gap:6px; padding:4px 8px; font-size:11px; }
  .chip { width: 14px; height: 14px; border-radius: 3px; }
</style>
<h1>Conviction polaroid palette spread — ${count} resolved receipts</h1>
<div class="grid">
${thumbnails
  .map(
    (b64, i) => `
  <div class="cell">
    <img src="data:image/png;base64,${b64}" />
    <div class="swatch"><span class="chip" style="background:${colors[i]}"></span>${colors[i]}</div>
  </div>`,
  )
  .join('')}
</div>
`;

  const tempPath = join(OUT_DIR, 'palette-grid.html');
  await writeFile(tempPath, html);
  await page.goto(`file:///${tempPath.replace(/\\/g, '/')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: join(OUT_DIR, 'palette-grid.png'),
    fullPage: true,
  });

  const distinct = new Set(colors.filter(Boolean)).size;
  console.log(`\nDistinct sky-top hex colors across ${count} receipts: ${distinct}`);

  await browser.close();
  console.log(`Grid screenshot: ${join(OUT_DIR, 'palette-grid.png')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
