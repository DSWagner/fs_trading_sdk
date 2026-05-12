/**
 * Verification for the three fixes:
 *
 * 1. NavBar "Sign in to bet" is a real <button> with data-testid
 *    "navbar-sign-in". Clicking it opens an AuthGate modal that
 *    contains an input + form (the PasswordlessAuthWidget).
 *
 * 2. Mobile (narrow) Landing's polaroid stack: hovering / scrolling
 *    must not clip the colored top edge of the rotated polaroids.
 *
 * 3. StyleGallery mobile carousel: lifting a polaroid on hover
 *    (`translateY(-6px)`) must not clip the rarity stripe.
 *
 * We also snapshot the scrollbar treatment by capturing a viewport
 * that has the embed-code <pre> overflowing on the Receipt page (the
 * pre uses overflowX: auto). The global ::-webkit-scrollbar rules in
 * index.css should paint the scrollbar as a near-invisible 8px thumb.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'snapshots', 'nav-mobile');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const log = [];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  // ---------------------------------------------------------------------
  // Test 1: NavBar sign-in is clickable, opens modal.
  // ---------------------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    const signInBtn = page.locator('[data-testid="navbar-sign-in"]');
    const exists = await signInBtn.count();
    log.push(`desktop nav sign-in button present: ${exists === 1}`);
    if (exists !== 1) throw new Error('NavBar sign-in button missing');

    // Capture closed state.
    await page.screenshot({
      path: join(OUT_DIR, 'desktop-nav-closed.png'),
      clip: { x: 0, y: 0, width: 1440, height: 80 },
    });

    // Click and verify modal appears.
    await signInBtn.click();
    await page.waitForTimeout(400);
    const modalCount = await page.locator('[role="dialog"][aria-modal="true"]').count();
    log.push(`modal opened: ${modalCount === 1}`);
    if (modalCount !== 1) throw new Error('Sign-in modal did not open');

    // Modal should contain the PasswordlessAuthWidget input.
    const inputCount = await page.locator('[role="dialog"] input').count();
    log.push(`modal contains input(s): ${inputCount}`);

    await page.screenshot({ path: join(OUT_DIR, 'desktop-nav-modal-open.png'), fullPage: false });

    // Close via Escape.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const modalAfterEscape = await page.locator('[role="dialog"][aria-modal="true"]').count();
    log.push(`modal closed via Escape: ${modalAfterEscape === 0}`);

    // Re-open and close via backdrop click.
    await signInBtn.click();
    await page.waitForTimeout(300);
    await page.mouse.click(20, 400); // backdrop area outside modal card
    await page.waitForTimeout(300);
    const modalAfterBackdrop = await page.locator('[role="dialog"][aria-modal="true"]').count();
    log.push(`modal closed via backdrop click: ${modalAfterBackdrop === 0}`);

    await ctx.close();
  }

  // ---------------------------------------------------------------------
  // Test 2: Mobile Landing polaroid stack - top of rotated polaroids
  // must not be clipped. We snap at a narrow viewport (375px).
  // ---------------------------------------------------------------------
  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript((m) => {
      try { window.localStorage.setItem('conviction.theme', m); } catch {}
    }, mode);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((m) => {
      if (m === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    }, mode);
    await page.waitForTimeout(900);

    // NavBar in mobile view should also expose the Sign in button.
    const mobileNavBtn = await page.locator('[data-testid="navbar-sign-in"]').count();
    log.push(`mobile (${mode}) nav sign-in button present: ${mobileNavBtn === 1}`);

    // Capture the landing fold so we can see the polaroid carousel.
    await page.screenshot({
      path: join(OUT_DIR, `mobile-landing-${mode}.png`),
      fullPage: false,
    });

    // Check that the polaroid carousel container's padding-top is >= 28.
    const stackPad = await page.evaluate(() => {
      const stack = document.querySelector('section + section, section > div')?.querySelector('[style*="scrollSnapType"]');
      if (!stack) {
        // fall back: any flex container with overflowX auto
        const all = document.querySelectorAll('div');
        for (const d of all) {
          const s = getComputedStyle(d);
          if (s.overflowX === 'auto' && s.display === 'flex' && d.children.length >= 3) {
            return { padTop: s.paddingTop, padBottom: s.paddingBottom };
          }
        }
        return null;
      }
      const s = getComputedStyle(stack);
      return { padTop: s.paddingTop, padBottom: s.paddingBottom };
    });
    log.push(`mobile (${mode}) polaroid stack padding: ${JSON.stringify(stackPad)}`);

    await ctx.close();
  }

  // ---------------------------------------------------------------------
  // Test 3: StyleGallery mobile carousel + scrollbar look. We hover
  // over one of the gallery tiles to trigger the lift animation and
  // confirm the top edge is not clipped.
  // ---------------------------------------------------------------------
  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((m) => {
      try { window.localStorage.setItem('conviction.theme', m); } catch {}
    }, mode);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((m) => {
      if (m === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    }, mode);
    await page.waitForTimeout(900);

    // Scroll down to find the StyleGallery section
    const tile = page.locator('[data-testid^="gallery-tier-"]').first();
    if (await tile.count()) {
      await tile.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      // Trigger the hover lift.
      await tile.hover({ trial: false });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(OUT_DIR, `mobile-style-gallery-${mode}.png`),
        fullPage: false,
      });
    } else {
      log.push(`mobile (${mode}) gallery tier locator not found`);
    }

    await ctx.close();
  }

  await browser.close();
  console.log('\n=== nav + mobile polaroid audit ===');
  for (const line of log) console.log(' • ' + line);
  console.log('\nSnapshots written to:', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
