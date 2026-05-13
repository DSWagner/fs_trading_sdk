/**
 * Pure-function tests for the curated `DEMO_GALLERIES` lookup helpers.
 *
 * The Profile and Receipt pages use these to render Studio Pick
 * receipts even when the visitor's localStorage has no entry for the
 * demo handle (which was the cause of the "@critic_at_large hasn't
 * gone on the record yet" dead-end before this fix).
 */
import { describe, expect, it } from 'vitest';
import {
  DEMO_GALLERIES,
  getDemoBet,
  getDemoGallery,
  isDemoMarketId,
} from '../../demo-app/src/conviction/demoGalleries';

describe('DEMO_GALLERIES', () => {
  it('ships at least three curated galleries', () => {
    expect(DEMO_GALLERIES.length).toBeGreaterThanOrEqual(3);
  });

  it('each demo bet carries the fields the Polaroid needs', () => {
    for (const g of DEMO_GALLERIES) {
      for (const b of g.bets) {
        expect(b.username).toBe(g.username);
        expect(typeof b.marketId).toBe('string');
        expect(typeof b.positionId).toBe('string');
        expect(typeof b.prediction).toBe('number');
        expect(typeof b.collateral).toBe('number');
        expect(typeof b.reasoning).toBe('string');
        expect(b.lowerBound).not.toBeNull();
        expect(b.upperBound).not.toBeNull();
        expect(b.consensusAtBet).not.toBeNull();
        expect(b.__demoOutcome).toBeTypeOf('number');
      }
    }
  });
});

describe('getDemoGallery', () => {
  it('returns the gallery for known handles (case-sensitive)', () => {
    const g = getDemoGallery('critic_at_large');
    expect(g).not.toBeNull();
    expect(g!.username).toBe('critic_at_large');
    expect(g!.bets.length).toBeGreaterThan(0);
  });

  it('returns null for unknown handles', () => {
    expect(getDemoGallery('not_a_real_demo_handle')).toBeNull();
    expect(getDemoGallery('')).toBeNull();
  });

  it('is case-sensitive — matches exact handle only', () => {
    expect(getDemoGallery('CRITIC_AT_LARGE')).toBeNull();
  });
});

describe('getDemoBet', () => {
  it('returns the bet for known marketId + positionId pairs', () => {
    const b = getDemoBet('demo-best-picture', 'critic-1');
    expect(b).not.toBeNull();
    expect(b!.username).toBe('critic_at_large');
    expect(b!.__demoOutcome).toBe(78);
  });

  it('returns null when the pair does not match any demo bet', () => {
    expect(getDemoBet('demo-best-picture', 'wrong-position')).toBeNull();
    expect(getDemoBet('nope', 'critic-1')).toBeNull();
    expect(getDemoBet('', '')).toBeNull();
  });
});

describe('isDemoMarketId', () => {
  it('identifies all demo gallery markets', () => {
    expect(isDemoMarketId('demo-best-picture')).toBe(true);
    expect(isDemoMarketId('demo-gpt-release')).toBe(true);
    expect(isDemoMarketId('demo-taylor-tour')).toBe(true);
  });

  it('rejects unknown market ids', () => {
    expect(isDemoMarketId('m-real-market')).toBe(false);
    expect(isDemoMarketId('')).toBe(false);
  });
});
