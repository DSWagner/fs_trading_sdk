/**
 * Tests for Conviction's localStorage ledger.
 *
 * Covers:
 *   - record + read round-trip
 *   - replace-existing semantics (same key, second write wins)
 *   - getBetsByUser filter
 *   - tolerance to a corrupt store (returns empty array, does not throw)
 *   - username persistence
 *   - new bets unshifted to the front (newest first)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordBet,
  getAllBets,
  getBet,
  getBetsByUser,
  receiptKey,
  rememberUsername,
  recallUsername,
  forgetUsername,
  type BetRecord,
} from '../../demo-app/src/conviction/storage';

function clear() {
  window.localStorage.clear();
}

const sample = (overrides: Partial<BetRecord> = {}): BetRecord => ({
  marketId: 'm1',
  positionId: 'p1',
  username: 'tester',
  reasoning: 'because reasons',
  conviction: 0.7,
  prediction: 50,
  spread: 5,
  collateral: 25,
  shape: 'gaussian',
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  marketTitle: 'demo',
  marketUnits: 'pts',
  lowerBound: 0,
  upperBound: 100,
  preset: 'auto',
  ...overrides,
});

describe('storage.ts: receiptKey', () => {
  it('formats string and number ids consistently', () => {
    expect(receiptKey('m1', 'p1')).toBe('m1:p1');
    expect(receiptKey(7, 42)).toBe('7:42');
    expect(receiptKey('m1', 7)).toBe('m1:7');
  });
});

describe('storage.ts: recordBet / getBet / getAllBets', () => {
  beforeEach(clear);

  it('round-trips a single bet', () => {
    const bet = sample();
    recordBet(bet);
    expect(getBet(bet.marketId, bet.positionId)).toEqual(bet);
  });

  it('returns null for a missing bet', () => {
    expect(getBet('does', 'not-exist')).toBeNull();
  });

  it('keeps multiple bets and returns them all', () => {
    recordBet(sample({ positionId: 'a' }));
    recordBet(sample({ positionId: 'b' }));
    recordBet(sample({ positionId: 'c' }));
    expect(getAllBets()).toHaveLength(3);
  });

  it('replaces an existing bet with the same (marketId, positionId)', () => {
    recordBet(sample({ reasoning: 'first take' }));
    recordBet(sample({ reasoning: 'second take' }));
    const all = getAllBets();
    expect(all).toHaveLength(1);
    expect(all[0].reasoning).toBe('second take');
  });

  it('newest bets come first', () => {
    recordBet(sample({ positionId: 'oldest' }));
    recordBet(sample({ positionId: 'middle' }));
    recordBet(sample({ positionId: 'newest' }));
    const all = getAllBets();
    expect(all.map((b) => b.positionId)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('handles numeric ids identically to string ids', () => {
    recordBet(sample({ marketId: 7, positionId: 42 }));
    expect(getBet('7', '42')).not.toBeNull();
    expect(getBet(7, 42)).not.toBeNull();
    expect(getBet('7', '42')).toEqual(getBet(7, 42));
  });
});

describe('storage.ts: getBetsByUser', () => {
  beforeEach(clear);

  it('returns only bets matching the username', () => {
    recordBet(sample({ positionId: '1', username: 'alice' }));
    recordBet(sample({ positionId: '2', username: 'bob' }));
    recordBet(sample({ positionId: '3', username: 'alice' }));
    const alice = getBetsByUser('alice');
    expect(alice).toHaveLength(2);
    expect(alice.every((b) => b.username === 'alice')).toBe(true);
  });

  it('returns an empty array for a user with no bets', () => {
    recordBet(sample({ username: 'someone-else' }));
    expect(getBetsByUser('nobody')).toEqual([]);
  });

  it('matches case-sensitively', () => {
    recordBet(sample({ username: 'Alice' }));
    expect(getBetsByUser('alice')).toEqual([]);
    expect(getBetsByUser('Alice')).toHaveLength(1);
  });
});

describe('storage.ts: corrupt / missing store tolerance', () => {
  beforeEach(clear);

  it('returns [] when localStorage is empty', () => {
    expect(getAllBets()).toEqual([]);
  });

  it('returns [] when the stored value is not JSON', () => {
    window.localStorage.setItem('conviction.v1', 'not json at all');
    expect(getAllBets()).toEqual([]);
  });

  it('returns [] when the stored JSON has no bets array', () => {
    window.localStorage.setItem('conviction.v1', JSON.stringify({ unrelated: true }));
    expect(getAllBets()).toEqual([]);
  });

  it('returns [] when the stored JSON has bets as a non-array', () => {
    window.localStorage.setItem('conviction.v1', JSON.stringify({ bets: 'oops' }));
    expect(getAllBets()).toEqual([]);
  });

  it('a successful write after a corrupt store recovers cleanly', () => {
    window.localStorage.setItem('conviction.v1', '{not valid');
    recordBet(sample());
    expect(getAllBets()).toHaveLength(1);
  });
});

describe('storage.ts: username persistence', () => {
  beforeEach(clear);

  it('round-trips remember -> recall', () => {
    rememberUsername('cataclysm');
    expect(recallUsername()).toBe('cataclysm');
  });

  it('returns null when nothing has been remembered', () => {
    expect(recallUsername()).toBeNull();
  });

  it('forgetUsername removes the value', () => {
    rememberUsername('temp');
    forgetUsername();
    expect(recallUsername()).toBeNull();
  });

  it('overwriting replaces the previous value', () => {
    rememberUsername('first');
    rememberUsername('second');
    expect(recallUsername()).toBe('second');
  });
});
