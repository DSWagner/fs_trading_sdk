/**
 * @vitest-environment node
 *
 * Receipt-for-Receipt challenge plumbing tests. Covers:
 *   - `buildChallengeUrl` builds a routable URL that survives a roundtrip
 *     through `decodeChallengeFromSearch`
 *   - `mirrorPrediction` produces the mathematical mirror of the
 *     original across consensus, clamped to bounds
 *   - `buildChallengeReasoning` emits a Markdown-style blockquote
 *     that includes the original handle and the truncated reasoning
 *   - `buildChallengeSeed` ties the above three together into the
 *     final seed the BetFlow page consumes
 */
import { describe, expect, it } from 'vitest';
import {
  buildChallengeUrl,
  decodeChallengeFromSearch,
  mirrorPrediction,
  buildChallengeReasoning,
  buildChallengeSeed,
} from '../../demo-app/src/conviction/challenge';

describe('mirrorPrediction', () => {
  it('reflects across the consensus mean (typical case)', () => {
    expect(mirrorPrediction(80, 50, 0, 100)).toBe(20);
    expect(mirrorPrediction(30, 50, 0, 100)).toBe(70);
  });

  it('returns consensus itself when the original sits on top of consensus', () => {
    expect(mirrorPrediction(50, 50, 0, 100)).toBe(50);
  });

  it('clamps to the lower bound when the mirror underflows', () => {
    expect(mirrorPrediction(95, 10, 0, 100)).toBe(0);
  });

  it('clamps to the upper bound when the mirror overflows', () => {
    expect(mirrorPrediction(5, 90, 0, 100)).toBe(100);
  });

  it('falls back to the range midpoint when consensus is null', () => {
    expect(mirrorPrediction(20, null, 0, 100)).toBe(80);
  });

  it('survives reversed bounds (lower > upper)', () => {
    expect(mirrorPrediction(80, 50, 100, 0)).toBe(20);
  });
});

describe('buildChallengeReasoning', () => {
  it('quotes the original reasoning in a counter-to-handle blockquote', () => {
    const out = buildChallengeReasoning({
      reasoning: 'I think Anora has the indie distributor energy nobody saw coming.',
      username: 'critic_at_large',
    });
    expect(out).toContain('@critic_at_large');
    expect(out).toContain('"I think Anora');
    expect(out).toContain('My take:');
  });

  it('truncates very long original reasoning', () => {
    const longReasoning = 'A'.repeat(500);
    const out = buildChallengeReasoning({
      reasoning: longReasoning,
      username: 'whale',
    });
    expect(out.length).toBeLessThan(500);
    expect(out).toContain('\u2026');
  });

  it('falls back gracefully when the original has no reasoning', () => {
    const out = buildChallengeReasoning({ reasoning: '', username: 'nobody' });
    expect(out).toContain('@nobody');
    expect(out).toContain('(no reasoning posted)');
  });

  it('falls back to "they" when the username is missing', () => {
    const out = buildChallengeReasoning({ reasoning: 'hot take' });
    expect(out).toContain('Counter to they');
  });
});

describe('buildChallengeSeed', () => {
  it('produces a mirrored prediction and a counter blockquote', () => {
    const seed = buildChallengeSeed(
      {
        reasoning: 'AI revenue is overstated.',
        username: 'analyst',
        prediction: 80,
        shape: 'gaussian',
        conviction: 0.9,
      },
      { consensusMean: 50, lowerBound: 0, upperBound: 100 },
    );
    expect(seed.prediction).toBe(20);
    expect(seed.conviction).toBe(0.5);
    expect(seed.shape).toBe('gaussian');
    expect(seed.reasoning).toContain('@analyst');
    expect(seed.challengedHandle).toBe('analyst');
  });

  it('does NOT mirror conviction - challenger starts neutral at 0.5', () => {
    const seed = buildChallengeSeed(
      { reasoning: '...', username: 'x', prediction: 80, conviction: 0.99 },
      { consensusMean: 50, lowerBound: 0, upperBound: 100 },
    );
    expect(seed.conviction).toBe(0.5);
  });

  it('coerces unknown shapes to gaussian', () => {
    const seed = buildChallengeSeed(
      { reasoning: '...', username: 'x', prediction: 80, shape: 'mystery-shape' },
      { consensusMean: 50, lowerBound: 0, upperBound: 100 },
    );
    expect(seed.shape).toBe('gaussian');
  });

  it('preserves range + bimodal shapes', () => {
    const a = buildChallengeSeed(
      { reasoning: '...', username: 'x', prediction: 80, shape: 'range' },
      { consensusMean: 50, lowerBound: 0, upperBound: 100 },
    );
    expect(a.shape).toBe('range');
    const b = buildChallengeSeed(
      { reasoning: '...', username: 'x', prediction: 80, shape: 'bimodal' },
      { consensusMean: 50, lowerBound: 0, upperBound: 100 },
    );
    expect(b.shape).toBe('bimodal');
  });
});

describe('challenge URL roundtrip', () => {
  it('buildChallengeUrl + decodeChallengeFromSearch are inverses', () => {
    const original = {
      reasoning: 'AI revenue is overstated.',
      username: 'analyst',
      prediction: 80,
      conviction: 0.9,
      shape: 'range',
      collateral: 50,
    };
    const url = buildChallengeUrl('market-123', original);
    expect(url).toContain('/m/market-123');
    expect(url).toContain('challenge=');

    const search = url.slice(url.indexOf('?'));
    const decoded = decodeChallengeFromSearch(search);
    expect(decoded).not.toBeNull();
    expect(decoded?.reasoning).toBe(original.reasoning);
    expect(decoded?.username).toBe(original.username);
    expect(decoded?.prediction).toBe(original.prediction);
  });

  it('returns null for missing or malformed parameter', () => {
    expect(decodeChallengeFromSearch(null)).toBeNull();
    expect(decodeChallengeFromSearch(undefined)).toBeNull();
    expect(decodeChallengeFromSearch('')).toBeNull();
    expect(decodeChallengeFromSearch('?foo=bar')).toBeNull();
    expect(decodeChallengeFromSearch('?challenge=not-base64!@#')).toBeNull();
  });

  it('accepts a URLSearchParams instance directly', () => {
    const params = new URLSearchParams('challenge=' + encodeURIComponent('not-base64!@#'));
    // base64 decoder returns null for garbage; same behaviour either way
    expect(decodeChallengeFromSearch(params)).toBeNull();
  });

  it('URL-encodes special characters in the marketId', () => {
    const url = buildChallengeUrl('weird id with spaces', { reasoning: 'x', username: 'a' });
    expect(url).toMatch(/\/m\/weird%20id%20with%20spaces/);
  });
});
