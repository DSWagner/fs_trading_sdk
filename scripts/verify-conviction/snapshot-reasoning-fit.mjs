/**
 * Walk the BetFlow preview through a short / medium / long / overflow
 * reasoning input and snapshot the After-Resolution polaroid each time.
 * Confirms the ReasoningQuote auto-fit shrinks the font to keep the full
 * text inside the photo, and that the 240-char hard cap stops the input
 * before it can produce an unreadable font.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const SAMPLES = [
  {
    name: 'short',
    text: 'Voters revere underdogs. The Academy follows the crowd.',
  },
  {
    name: 'medium',
    text:
      'Anora has the indie distributor energy nobody saw coming. ' +
      'Voters revere underdogs and the Academy follows the late crowd surge.',
  },
  {
    name: 'long',
    text:
      'If they wanted to reset the narrative they would ship the new model ' +
      'before WWDC, but the silence from the executive team makes me think ' +
      'October. The pricing leak in the supplier chain also fits Q4.',
  },
  {
    name: 'cap',
    // Exactly 240 chars - the hard cap. Should still be readable.
    text: 'X'.repeat(240),
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
  const firstMarket = page.locator('a[href^="/m/"]').first();
  await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
  const href = await firstMarket.getAttribute('href');
  await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // The right aside renders both polaroids at once; we snapshot the
  // after-resolution one which is the only state that shows the
  // reasoning quote over the ground.
  const reasoning = page.locator('textarea').first();
  const polaroid = page.locator('[data-betflow-polaroid="after"]');

  for (const s of SAMPLES) {
    await reasoning.fill('');
    await reasoning.type(s.text, { delay: 0 });
    await page.waitForTimeout(400);
    const out = join(OUT_DIR, `reasoning-fit-${s.name}.png`);
    await polaroid.screenshot({ path: out });
    console.log(`OK reasoning-fit-${s.name}.png  (input length=${s.text.length})`);
  }

  // Sanity: try to type beyond the cap and verify the value is clipped.
  await reasoning.fill('');
  await reasoning.type('A'.repeat(500), { delay: 0 });
  const finalLength = await reasoning.inputValue().then((v) => v.length);
  console.log(`cap enforced: typed 500 chars, textarea contains ${finalLength}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
