/**
 * @vitest-environment jsdom
 *
 * Render tests for the legendary/mythic aurora palette.
 *
 * The user previously reported the aurora curtain reading as a neon
 * turquoise wash that did not feel like a real aurora photograph. We
 * replaced the single bright auroral-green band (#4DD9A0) with a
 * layered stack of pink/violet/blue with a muted sage green at the
 * base so the curtain reads like a layered atmospheric photograph.
 *
 * These tests pin the new palette so regressions are caught
 * immediately. They check the rendered <stop> elements inside the
 * aurora gradient — not screenshots, so they remain stable across
 * font/spacing tweaks.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Polaroid } from '../../demo-app/src/conviction/components/Polaroid';

// A high-rarity bet: contrarian + perfectly accurate -> mythic tier.
const mythicBaseline = {
  marketId: 'aurora-test',
  positionId: 'p1',
  marketTitle: 'Bitcoin closes above 120k by year-end',
  marketUnits: 'k',
  username: 'tape_reader',
  reasoning: 'Spot ETF flows are clean.',
  createdAt: new Date('2026-05-11').toISOString(),
  prediction: 132,
  spread: 6,
  conviction: 0.9,
  collateral: 25,
  shape: 'gaussian' as const,
  lowerBound: 80,
  upperBound: 180,
  resolutionState: 'resolved' as const,
  resolvedOutcome: 132,
  consensusAtBet: 82,
};

// A legendary tier bet (close-but-not-perfect + contrarian).
const legendaryBaseline = {
  ...mythicBaseline,
  prediction: 130,
  resolvedOutcome: 132,
};

function gradientStops(container: HTMLElement, gradIdPrefix: string): Array<{ color: string; opacity: string }> {
  // Aurora gradient ids are of the form `aurora-<seed>-<i>` or
  // `aurora-accent-<seed>-<i>`. Walk the DOM and collect stops from
  // every gradient whose id starts with `gradIdPrefix`.
  const grads = Array.from(container.querySelectorAll('linearGradient'));
  const stops: Array<{ color: string; opacity: string }> = [];
  for (const g of grads) {
    if (!g.id.startsWith(gradIdPrefix)) continue;
    for (const s of Array.from(g.querySelectorAll('stop'))) {
      stops.push({
        color: (s.getAttribute('stop-color') ?? '').toLowerCase(),
        opacity: s.getAttribute('stop-opacity') ?? '',
      });
    }
  }
  return stops;
}

describe('Polaroid aurora palette (legendary + mythic)', () => {
  it('renders an aurora gradient on mythic receipts', () => {
    const { container } = render(<Polaroid {...mythicBaseline} />);
    const stops = gradientStops(container, 'aurora-');
    expect(stops.length).toBeGreaterThan(0);
    cleanup();
  });

  it('does NOT use the old bright turquoise auroral-green', () => {
    const { container } = render(<Polaroid {...mythicBaseline} />);
    const stops = gradientStops(container, 'aurora-');
    for (const s of stops) {
      expect(s.color).not.toBe('#4dd9a0');
    }
    cleanup();
  });

  it('includes a pink/rose hue at the high-altitude top of the curtain', () => {
    const { container } = render(<Polaroid {...mythicBaseline} />);
    const stops = gradientStops(container, 'aurora-');
    // Both legendary (#E8A8B8) and mythic (#F08099) variants are
    // pink-family — checking they exist anywhere in the stop list.
    const pinkLike = stops.some((s) => /^#(f0|e8)[0-9a-f]{4}$/.test(s.color));
    expect(pinkLike).toBe(true);
    cleanup();
  });

  it('includes a soft purple/violet hue for the mid band', () => {
    const { container } = render(<Polaroid {...mythicBaseline} />);
    const stops = gradientStops(container, 'aurora-');
    // mythic violet #9F6FCF, legendary #A883D9
    const purpleLike = stops.some((s) => /^#(9f|a8)[0-9a-f]{4}$/.test(s.color));
    expect(purpleLike).toBe(true);
    cleanup();
  });

  it('includes a periwinkle/cornflower blue hue', () => {
    const { container } = render(<Polaroid {...mythicBaseline} />);
    const stops = gradientStops(container, 'aurora-');
    // mythic blue #5C7AD8, legendary blue #7090E0
    const blueLike = stops.some((s) => /^#(5c|70)[0-9a-f]{4}$/.test(s.color));
    expect(blueLike).toBe(true);
    cleanup();
  });

  it('keeps a muted sage green present but quiet (not the loud neon)', () => {
    const { container } = render(<Polaroid {...mythicBaseline} />);
    const stops = gradientStops(container, 'aurora-');
    // Sage green #6DB892 should appear in the lower body stops.
    const sageLike = stops.some((s) => s.color === '#6db892');
    expect(sageLike).toBe(true);
    cleanup();
  });

  it('legendary uses a softer rose-pink than mythic crimson-pink', () => {
    const { container: legendary } = render(<Polaroid {...legendaryBaseline} />);
    const legStops = gradientStops(legendary, 'aurora-');
    const hasRose = legStops.some((s) => s.color === '#e8a8b8');
    expect(hasRose).toBe(true);
    cleanup();
    const { container: mythic } = render(<Polaroid {...mythicBaseline} />);
    const mythStops = gradientStops(mythic, 'aurora-');
    const hasCrimson = mythStops.some((s) => s.color === '#f08099');
    expect(hasCrimson).toBe(true);
    cleanup();
  });
});
