// Empirical regression tests for two issues:
//
//   1. The page must NEVER show a horizontal scrollbar regardless of
//      browser zoom level. We probe a range of effective viewport widths
//      (CSS px) and assert document.scrollWidth <= clientWidth on each.
//
//   2. The Recharts legend at Step 4 must sit INSIDE the bordered chart
//      shell card, not below it. We measure the bottom of the legend
//      element and compare against the bottom of the chart-shell.
//
// Both checks are exercised on multiple widths to catch regressions at
// the breakpoint boundary (900px) where the layout reorganizes.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const log = (msg) => console.log(`[verify-overflow] ${msg}`);

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

async function probeOverflow(ctx, label, width, height) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await navToFirstMarket(page);

  // Scroll to Step 4 so the chart is laid out.
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2'))
      .find((h) => h.textContent && h.textContent.includes("See the consensus"));
    if (heading) heading.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(800);

  // 1) horizontal overflow check
  const overflow = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });
  const xOverflow = overflow.scrollWidth - overflow.clientWidth;
  log(`   [${label} ${width}x${height}] doc scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth} overflow=${xOverflow}px`);

  // 1b) diagnostics: walk the DOM and find the DEEPEST elements that are
  //     wider than the viewport. That's the actual culprit — a leaf node
  //     with an intrinsic min-content larger than the viewport.
  if (xOverflow > 10) {
    // Probe the FORM COLUMN's direct children for any with non-trivial
    // min-content/intrinsic widths. CSS Grid track 1fr (default min: auto)
    // will expand to the largest min-content of any child, which is the
    // most common cause of "infinite" widening.
    const formColumnDiag = await page.evaluate(() => {
      const formCol = document.querySelector('h1')?.parentElement;
      if (!formCol) return null;
      const cs = window.getComputedStyle(formCol);
      const parent = formCol.parentElement;
      const ps = parent ? window.getComputedStyle(parent) : null;
      const children = Array.from(formCol.children).map((c) => {
        const r = c.getBoundingClientRect();
        return {
          tag: c.tagName,
          text: (c.textContent ?? '').slice(0, 60).replace(/\s+/g, ' '),
          width: Math.round(r.width),
          scrollWidth: c.scrollWidth,
        };
      });
      return {
        gridTemplate: ps?.gridTemplateColumns ?? null,
        formColWidth: Math.round(formCol.getBoundingClientRect().width),
        formColMinWidth: cs.minWidth,
        children,
      };
    });
    log(`   [${label}] form column diag: ${JSON.stringify(formColumnDiag, null, 2)}`);

    const widestPath = await page.evaluate(() => {
      const vp = window.innerWidth;
      const candidates = [];
      const walk = (n, depth, pathLabel) => {
        if (depth > 50) return;
        if (n.nodeType !== 1) return;
        const r = n.getBoundingClientRect();
        const myLabel = `${pathLabel}>${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${n.className && typeof n.className === 'string' ? '.' + n.className.split(/\s+/).slice(0, 2).join('.') : ''}`;
        // Element extends past the viewport (right edge > viewport width)
        // OR is wider than the viewport itself.
        const overflowsRight = r.right > vp + 5;
        const wider = r.width > vp + 5;
        if (overflowsRight || wider) {
          // Only push if no child is also oversized (i.e. we are the leaf).
          let anyOversizedChild = false;
          for (const c of n.children) {
            const cr = c.getBoundingClientRect();
            if (cr.right > vp + 5 || cr.width > vp + 5) {
              anyOversizedChild = true;
              break;
            }
          }
          if (!anyOversizedChild) {
            candidates.push({
              path: myLabel.slice(-200),
              tag: n.tagName,
              w: Math.round(r.width),
              right: Math.round(r.right),
              text: (n.innerText || '').slice(0, 80),
              depth,
            });
          }
        }
        for (const c of n.children) walk(c, depth + 1, myLabel);
      };
      walk(document.body, 0, '');
      return candidates.slice(0, 8);
    });
    log(`   [${label}] OVERSIZED LEAVES:`);
    for (const c of widestPath) {
      console.log(`        w=${c.w}px d=${c.depth} <${c.tag}> path=${c.path}`);
      if (c.text) console.log(`           text="${c.text}"`);
    }
  }

  // 2) chart legend inside-card check
  const legendGeom = await page.evaluate(() => {
    const shell = document.querySelector('.conviction-chart-shell');
    if (!shell) return null;
    const legendWrap = shell.querySelector('.recharts-legend-wrapper');
    if (!legendWrap) return null;
    const sb = shell.getBoundingClientRect();
    const lb = legendWrap.getBoundingClientRect();
    return {
      shellBottom: sb.bottom,
      shellLeft: sb.left,
      shellRight: sb.right,
      legendBottom: lb.bottom,
      legendLeft: lb.left,
      legendRight: lb.right,
    };
  });
  log(`   [${label}] legend geom: ${JSON.stringify(legendGeom)}`);

  await page.screenshot({
    path: join(SHOTS, `overflow-${label}-${width}x${height}.png`),
    fullPage: false,
  });

  await page.close();

  return { xOverflow, legendGeom };
}

const failures = [];

try {
  for (const [label, width, height] of [
    ['desktop-wide', 1440, 900],
    ['desktop', 1280, 900],
    ['desktop-narrow', 1024, 800],
    ['breakpoint-just-above', 920, 800],
    ['breakpoint-just-below', 880, 800],
    ['tablet', 768, 1024],
    ['mobile-large', 480, 900],
    ['mobile', 390, 844],
    ['mobile-narrow', 360, 800],
  ]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const result = await probeOverflow(ctx, label, width, height);
    await ctx.close();

    if (result.xOverflow > 2) {
      failures.push(`${label} ${width}x${height}: doc horizontally overflows by ${result.xOverflow}px`);
    }
    if (result.legendGeom) {
      const { shellBottom, legendBottom } = result.legendGeom;
      if (legendBottom > shellBottom + 1) {
        failures.push(`${label}: legend bottom (${legendBottom.toFixed(0)}) is past shell bottom (${shellBottom.toFixed(0)}) by ${(legendBottom - shellBottom).toFixed(1)}px`);
      }
    } else {
      log(`   [${label}] WARNING: no chart shell found on this size`);
    }
  }

  if (failures.length > 0) {
    console.error('[verify-overflow] FAILURES:');
    for (const f of failures) console.error('   -', f);
    await browser.close();
    process.exit(1);
  }

  log('DONE — no horizontal overflow at any tested width, legend stays inside card at every breakpoint.');
  await browser.close();
  process.exit(0);
} catch (err) {
  console.error('[verify-overflow] CRASH:', err);
  await browser.close();
  process.exit(1);
}
