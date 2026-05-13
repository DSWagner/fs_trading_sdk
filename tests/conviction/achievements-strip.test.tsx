/**
 * @vitest-environment jsdom
 *
 * AchievementsStrip render tests.
 *
 * Pins the contract that the Profile page relies on:
 *   1. Every defined achievement renders a tile, locked or unlocked.
 *   2. Locked tiles carry `data-locked="true"` so visual / a11y tests
 *      can target them.
 *   3. Unlocked tiles flip the locked attribute and surface the
 *      caption via `title=`.
 *   4. The header counter ("N / TOTAL UNLOCKED") matches the actual
 *      count.
 *   5. Mobile vs desktop layout uses different grid track sizes — we
 *      verify the grid template is set on the list root.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { AchievementsStrip } from '../../demo-app/src/conviction/components/AchievementsStrip';
import { ACHIEVEMENT_DEFINITIONS, type AchievementBet } from '../../demo-app/src/conviction/achievements';

afterEach(() => cleanup());

function bet(overrides: Partial<AchievementBet> = {}): AchievementBet {
  return {
    rarity: 'common',
    accuracy: null,
    createdAt: '2026-05-10T12:00:00Z',
    conviction: 0.5,
    resolutionState: 'open',
    disagreement: 0,
    ...overrides,
  };
}

describe('AchievementsStrip', () => {
  it('renders one tile per definition even on empty ledger', () => {
    render(<AchievementsStrip bets={[]} isMobile={false} />);
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      expect(screen.getByTestId(`achievement-tile-${def.id}`)).toBeTruthy();
    }
  });

  it('marks every tile as locked when the ledger is empty', () => {
    render(<AchievementsStrip bets={[]} isMobile={false} />);
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      const tile = screen.getByTestId(`achievement-tile-${def.id}`);
      expect(tile.getAttribute('data-locked')).toBe('true');
    }
  });

  it('flips first-signed to unlocked once a bet exists', () => {
    render(<AchievementsStrip bets={[bet()]} isMobile={false} />);
    const tile = screen.getByTestId('achievement-tile-first-signed');
    expect(tile.getAttribute('data-locked')).toBe('false');
  });

  it('surfaces the caption via title= on unlocked tiles', () => {
    render(<AchievementsStrip bets={[bet({ rarity: 'mythic' })]} isMobile={false} />);
    const tile = screen.getByTestId('achievement-tile-first-mythic');
    expect(tile.getAttribute('title')).toMatch(/Mythic/i);
  });

  it('surfaces the locked hint via title= on locked tiles', () => {
    render(<AchievementsStrip bets={[]} isMobile={false} />);
    const tile = screen.getByTestId('achievement-tile-first-mythic');
    expect(tile.getAttribute('title')).toMatch(/Locked\./);
  });

  it('updates the header counter to match unlocked count', () => {
    const { rerender } = render(<AchievementsStrip bets={[]} isMobile={false} />);
    expect(screen.getByLabelText(/0 of \d+ achievements unlocked/)).toBeTruthy();
    // Unlock first-signed by adding a single bet — counter should tick up.
    rerender(<AchievementsStrip bets={[bet()]} isMobile={false} />);
    expect(screen.getByLabelText(/1 of \d+ achievements unlocked/)).toBeTruthy();
  });

  it('uses a tighter grid track on mobile', () => {
    const { rerender } = render(<AchievementsStrip bets={[]} isMobile={true} />);
    const list = screen.getByTestId('achievements-list');
    expect(list.getAttribute('style')).toMatch(/minmax\(132px,/);
    rerender(<AchievementsStrip bets={[]} isMobile={false} />);
    expect(screen.getByTestId('achievements-list').getAttribute('style')).toMatch(/minmax\(160px,/);
  });

  it('renders progress text on locked tiles that define a target', () => {
    render(<AchievementsStrip bets={[bet(), bet()]} isMobile={false} />);
    const tile = screen.getByTestId('achievement-tile-five-call-streak');
    expect(tile.textContent).toMatch(/2 \/ 5/);
  });

  it('removes progress text on unlocked tiles to avoid visual clutter', () => {
    const ledger = Array.from({ length: 5 }, () => bet());
    render(<AchievementsStrip bets={ledger} isMobile={false} />);
    const tile = screen.getByTestId('achievement-tile-five-call-streak');
    // The textContent should not contain "5 / 5" (the progress
    // marker is suppressed when unlocked).
    expect(tile.textContent).not.toMatch(/5 \/ 5/);
  });
});
