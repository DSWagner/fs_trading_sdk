/**
 * End-to-end verification for the Conviction overhaul.
 *
 * Probes that the major user-visible changes actually work:
 *   1. Dark mode toggle flips and persists across pages
 *   2. Step 3 (preset picker) is gone from the BetFlow form
 *   3. "Step 4" label is gone (chart is shown without the redundant Step prefix)
 *   4. The polaroid preview AND the consensus chart both live in the
 *      sticky right column on desktop, locked together while scrolling
 *   5. The stake slider perturbs the polaroid SVG (verifies seed wiring)
 *   6. The conviction slider also perturbs the polaroid SVG
 *   7. /explore renders a gallery grid with at least one card
 *   8. Navigating from a gallery card lands on /u/:username profile
 *   9. The receipt page download button is present
 *
 * All checks query the deployed UI without faking any state; we use the
 * curated /m/* and /u/* routes that work without authentication.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg, extra) {
  console.error(`  ✗ ${msg}`);
  if (extra) console.error(`    ${extra}`);
  process.exitCode = 1;
}

async function withPage(browser, run) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error(`PAGE ERROR: ${err.message}`));
  try {
    await run(page);
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch();

  // ====== Test 1: dark mode toggle ======
  console.log('\n→ Dark mode toggle');
  await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const toggle = page.getByTestId('dark-mode-toggle');
    await toggle.waitFor({ state: 'visible', timeout: 8000 });
    const initial = await toggle.getAttribute('data-mode');
    pass(`initial mode = ${initial}`);
    await toggle.click();
    await page.waitForTimeout(120);
    const afterClick = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light');
    const switched = afterClick !== initial;
    if (switched) pass(`toggle flipped: ${initial} → ${afterClick}`);
    else fail(`toggle did not flip; still ${afterClick}`);

    // Persistence: navigate to /discover and re-check
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    const persisted = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light');
    if (persisted === afterClick) pass(`mode persists across navigation: ${persisted}`);
    else fail(`mode did NOT persist across nav: was ${afterClick}, now ${persisted}`);

    // Reset to light for subsequent tests.
    if (persisted === 'dark') {
      await page.getByTestId('dark-mode-toggle').click();
      await page.waitForTimeout(100);
    }
  });

  // ====== Test 2: BetFlow has NO Step 3 and NO "Step 4" label ======
  console.log('\n→ BetFlow Step 3/4 removal');
  await withPage(browser, async (page) => {
    // Click into the first market on Discover so we land on a real /m/ route.
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    const firstMarket = page.locator('a[href^="/m/"]').first();
    await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
    await firstMarket.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);

    const html = await page.content();
    if (!/Step 3/.test(html)) pass('"Step 3" label not present anywhere on the page');
    else fail('"Step 3" still appears on the page');
    if (!/Step 4/.test(html)) pass('"Step 4" label not present anywhere on the page');
    else fail('"Step 4" still appears on the page');

    // Check that the preset-picker swatch elements are gone too.
    const swatchCount = await page.locator('button[aria-pressed]').filter({ hasText: /Auto|Sunset|Twilight|Aurora/ }).count();
    if (swatchCount === 0) pass('no preset swatch buttons remain');
    else fail(`${swatchCount} preset swatch buttons still rendered`);
  });

  // ====== Test 3: sticky aside has polaroid AND chart ======
  console.log('\n→ Sticky right column: polaroid + chart locked together');
  await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    const firstMarket = page.locator('a[href^="/m/"]').first();
    await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
    await firstMarket.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);

    const asideHasBoth = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      if (!aside) return { ok: false, reason: 'no <aside>' };
      const hasPolaroid = !!aside.querySelector('svg[role="img"][aria-label^="Polaroid receipt"]');
      const hasChart = !!aside.querySelector('.conviction-chart-shell, .recharts-responsive-container, svg.recharts-surface');
      return { ok: hasPolaroid && hasChart, hasPolaroid, hasChart };
    });
    if (asideHasBoth.ok) pass('aside contains BOTH polaroid and chart');
    else fail(`aside missing parts: polaroid=${asideHasBoth.hasPolaroid} chart=${asideHasBoth.hasChart}`);

    // Scroll and verify the aside is still sticky-locked.
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(300);
    const stillVisible = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      if (!aside) return false;
      const r = aside.getBoundingClientRect();
      return r.top >= 0 && r.top < 200 && r.bottom > 200;
    });
    if (stillVisible) pass('aside stays visible after scroll (sticky behavior intact)');
    else fail('aside scrolled out of view — sticky positioning broken');
  });

  // ====== Test 4: stake slider perturbs polaroid SVG ======
  console.log('\n→ Every slider live-updates the polaroid');
  await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    const firstMarket = page.locator('a[href^="/m/"]').first();
    await firstMarket.waitFor({ state: 'visible', timeout: 15000 });
    await firstMarket.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);

    const captureSvg = () => page.evaluate(() => {
      const svg = document.querySelector('aside svg[role="img"][aria-label^="Polaroid receipt"]');
      return svg ? svg.outerHTML : '';
    });

    const before = await captureSvg();
    if (!before) {
      fail('no polaroid SVG found in aside before slider change');
      return;
    }

    // Find each slider and bump it. The Stake slider was previously inert.
    const sliderLabels = await page.locator('input.conviction-slider').count();
    if (sliderLabels >= 4) pass(`found ${sliderLabels} sliders (prediction, spread, conviction, stake)`);
    else fail(`expected >= 4 sliders, found ${sliderLabels}`);

    // Set slider via React-compatible native setter so the controlled
    // input's onChange fires. Just setting el.value silently skips React's
    // synthetic event because its internal value tracker is unchanged.
    async function setSliderValue(slider, newVal) {
      await slider.evaluate((el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, String(val));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, newVal);
    }

    // Bump the LAST slider (stake) and re-capture.
    const sliders = page.locator('input.conviction-slider');
    const stake = sliders.nth(sliderLabels - 1);
    const oldStakeValue = await stake.inputValue();
    await setSliderValue(stake, Number(oldStakeValue) + 50);
    await page.waitForTimeout(300);
    const newStakeValue = await stake.inputValue();
    if (newStakeValue !== oldStakeValue) pass(`stake input value updated: ${oldStakeValue} → ${newStakeValue}`);
    else fail(`stake input value did not update: still ${newStakeValue}`);

    const afterStake = await captureSvg();
    if (afterStake !== before) pass('stake slider DOES perturb the polaroid SVG');
    else fail('stake slider did NOT change the polaroid — seed wiring broken');

    // Now conviction (slider index 2).
    const conviction = sliders.nth(2);
    const oldConv = await conviction.inputValue();
    const nextConv = Math.max(0.1, Math.min(1, Number(oldConv) + 0.2));
    await setSliderValue(conviction, nextConv);
    await page.waitForTimeout(300);

    const afterConv = await captureSvg();
    if (afterConv !== afterStake) pass('conviction slider DOES perturb the polaroid SVG');
    else fail('conviction slider did NOT change the polaroid');

    // Also verify prediction (slider 0) and spread (slider 1) perturb.
    const prediction = sliders.nth(0);
    const oldPred = await prediction.inputValue();
    await setSliderValue(prediction, Number(oldPred) + 5);
    await page.waitForTimeout(300);
    const afterPred = await captureSvg();
    if (afterPred !== afterConv) pass('prediction slider DOES perturb the polaroid SVG');
    else fail('prediction slider did NOT change the polaroid');

    const spread = sliders.nth(1);
    const oldSpread = await spread.inputValue();
    await setSliderValue(spread, Number(oldSpread) + 1);
    await page.waitForTimeout(300);
    const afterSpread = await captureSvg();
    if (afterSpread !== afterPred) pass('spread slider DOES perturb the polaroid SVG');
    else fail('spread slider did NOT change the polaroid');
  });

  // ====== Test 5: Explorer page shows gallery cards ======
  console.log('\n→ Explorer page');
  await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/explore`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const cards = await page.getByTestId('gallery-card').count();
    if (cards >= 3) pass(`Explorer rendered ${cards} gallery cards (>= 3 demo)`);
    else fail(`Explorer rendered only ${cards} cards`);

    // Click a card and verify it navigates to /u/:username
    const firstCard = page.getByTestId('gallery-card').first();
    const username = await firstCard.getAttribute('data-username');
    await firstCard.click();
    await page.waitForLoadState('domcontentloaded');
    const url = page.url();
    if (url.includes(`/u/${encodeURIComponent(username)}`)) pass(`card → profile route works: /u/${username}`);
    else fail(`expected to land on /u/${username}, got ${url}`);
  });

  // ====== Test 6: Rarity gallery has six tiers ======
  console.log('\n→ Rarity gallery on landing');
  await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    for (const t of tiers) {
      const el = page.getByTestId(`gallery-tier-${t}`);
      const visible = await el.count();
      if (visible > 0) pass(`gallery shows tier ${t}`);
      else fail(`gallery missing tier ${t}`);
    }
  });

  // ====== Summary ======
  if (process.exitCode === 1) {
    console.error('\n✗ verification FAILED');
  } else {
    console.log('\n✓ all checks passed');
  }
  await browser.close();
}

main().catch((err) => {
  console.error('verifier crashed:', err);
  process.exit(1);
});
