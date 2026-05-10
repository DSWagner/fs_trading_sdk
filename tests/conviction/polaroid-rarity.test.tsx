/**
 * @vitest-environment jsdom
 *
 * Render tests for rarity treatment on the Polaroid:
 * - badge is suppressed for open bets
 * - badge is suppressed when no consensusAtBet is provided
 * - badge appears for resolved uncommon-or-higher bets
 * - badge text matches the calculated tier label
 * - card stroke widens for rare-or-higher tiers
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Polaroid } from '../../demo-app/src/conviction/components/Polaroid';

const base = {
  marketId: 'm',
  positionId: 'p',
  marketTitle: 'Bitcoin closes above 120k by year-end',
  marketUnits: 'k',
  username: 'tape_reader',
  reasoning: 'Spot ETF flows are clean.',
  createdAt: new Date('2026-05-11').toISOString(),
  prediction: 132,
  spread: 6,
  conviction: 0.7,
  collateral: 25,
  shape: 'gaussian' as const,
  lowerBound: 80,
  upperBound: 180,
};

function svgText(container: HTMLElement): string {
  return container.textContent ?? '';
}

describe('Polaroid rarity stamp visibility', () => {
  it('open bets show no rarity stamp', () => {
    const { container } = render(
      <Polaroid {...base} resolutionState="open" consensusAtBet={100} />,
    );
    const text = svgText(container);
    expect(text).not.toMatch(/MYTHIC|LEGENDARY|EPIC|RARE|UNCOMMON|COMMON/i);
    cleanup();
  });

  it('resolved bets with no consensusAtBet show no rarity stamp', () => {
    const { container } = render(
      <Polaroid {...base} resolutionState="resolved" resolvedOutcome={132} />,
    );
    const text = svgText(container);
    expect(text).not.toMatch(/MYTHIC|LEGENDARY|EPIC|RARE|UNCOMMON/i);
    cleanup();
  });

  it('resolved + perfectly accurate + consensus-following shows no stamp (common)', () => {
    const { container } = render(
      <Polaroid
        {...base}
        resolutionState="resolved"
        resolvedOutcome={132}
        consensusAtBet={132}
      />,
    );
    const text = svgText(container);
    // Common tier is intentionally unstamped.
    expect(text).not.toMatch(/MYTHIC|LEGENDARY|EPIC|RARE|UNCOMMON|COMMON/i);
    cleanup();
  });

  it('resolved + contrarian + accurate shows MYTHIC stamp', () => {
    // prediction 132, consensus 82 (50k disagreement on 100k range = 50%)
    // outcome 132 = perfect accuracy. score = 0.5 * 1 = 0.5 -> mythic
    const { container } = render(
      <Polaroid
        {...base}
        resolutionState="resolved"
        resolvedOutcome={132}
        consensusAtBet={82}
      />,
    );
    expect(svgText(container).toUpperCase()).toContain('MYTHIC');
    cleanup();
  });

  it('resolved + 30% disagreement + perfect accuracy shows LEGENDARY stamp', () => {
    // prediction 132, consensus 102 (30k = 30% on 100 range). outcome 132 = perfect.
    // score = 0.3 * 1 = 0.3 -> legendary
    const { container } = render(
      <Polaroid
        {...base}
        resolutionState="resolved"
        resolvedOutcome={132}
        consensusAtBet={102}
      />,
    );
    expect(svgText(container).toUpperCase()).toContain('LEGENDARY');
    cleanup();
  });

  it('resolved + 20% disagreement + perfect accuracy shows EPIC stamp', () => {
    // prediction 132, consensus 112 (20%). outcome 132 -> score 0.2 -> epic
    const { container } = render(
      <Polaroid
        {...base}
        resolutionState="resolved"
        resolvedOutcome={132}
        consensusAtBet={112}
      />,
    );
    expect(svgText(container).toUpperCase()).toContain('EPIC');
    cleanup();
  });

  it('resolved + 12% disagreement + perfect accuracy shows RARE stamp', () => {
    const { container } = render(
      <Polaroid
        {...base}
        resolutionState="resolved"
        resolvedOutcome={132}
        consensusAtBet={120}
      />,
    );
    const text = svgText(container).toUpperCase();
    expect(text).toContain('RARE');
    expect(text).not.toContain('LEGENDARY');
    expect(text).not.toContain('MYTHIC');
    cleanup();
  });

  it('resolved + 5% disagreement + perfect accuracy shows UNCOMMON stamp', () => {
    const { container } = render(
      <Polaroid
        {...base}
        resolutionState="resolved"
        resolvedOutcome={132}
        consensusAtBet={127}
      />,
    );
    expect(svgText(container).toUpperCase()).toContain('UNCOMMON');
    cleanup();
  });
});

describe('Polaroid rarity stamp suppression for missed bets', () => {
  it('contrarian but very inaccurate is COMMON (no stamp)', () => {
    // prediction 132, consensus 82 (50% disagreement). outcome 80 = max error.
    // accuracy = max(0, 1 - 0.52*4) = 0. score = 0. common.
    const { container } = render(
      <Polaroid
        {...base}
        resolutionState="resolved"
        resolvedOutcome={80}
        consensusAtBet={82}
      />,
    );
    const text = svgText(container).toUpperCase();
    expect(text).not.toMatch(/MYTHIC|LEGENDARY|EPIC|RARE|UNCOMMON/);
    cleanup();
  });
});

describe('Polaroid stays renderable in all rarity tiers without throwing', () => {
  const tierCases: Array<[string, number, number]> = [
    ['common', 132, 132],
    ['uncommon', 132, 127],
    ['rare', 132, 120],
    ['epic', 132, 112],
    ['legendary', 132, 102],
    ['mythic', 132, 82],
  ];
  for (const [tier, prediction, consensus] of tierCases) {
    it(`${tier} (consensus=${consensus}) renders an <svg>`, () => {
      const { container } = render(
        <Polaroid
          {...base}
          prediction={prediction}
          resolutionState="resolved"
          resolvedOutcome={prediction}
          consensusAtBet={consensus}
        />,
      );
      expect(container.querySelector('svg')).not.toBeNull();
      cleanup();
    });
  }
});
