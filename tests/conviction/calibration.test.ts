/**
 * @vitest-environment node
 *
 * Calibration scoring + leaderboard aggregation tests. Covers:
 *   - perfect calibration (conviction == accuracy on every sample)
 *     yields score 1
 *   - "always 100% sure but only right half the time" yields a
 *     score of exactly 0.5
 *   - bettors with zero resolved samples are dropped from the
 *     leaderboard
 *   - score / sample-count / username tiebreaker chain is stable
 *   - clamping of conviction / accuracy to [0, 1]
 */
import { describe, expect, it } from 'vitest';
import { calibrationScore, buildLeaderboard } from '../../demo-app/src/conviction/calibration';

describe('calibrationScore', () => {
  it('returns null for empty input', () => {
    expect(calibrationScore([])).toBeNull();
  });

  it('skips samples without accuracy and returns null if none remain', () => {
    expect(calibrationScore([{ conviction: 0.8, accuracy: null }])).toBeNull();
  });

  it('a perfectly calibrated bettor scores 1', () => {
    const r = calibrationScore([
      { conviction: 0.9, accuracy: 0.9 },
      { conviction: 0.7, accuracy: 0.7 },
      { conviction: 0.4, accuracy: 0.4 },
    ]);
    expect(r?.score).toBeCloseTo(1, 6);
    expect(r?.meanError).toBeCloseTo(0, 6);
    expect(r?.samples).toBe(3);
  });

  it('always-100%-sure but right-half-the-time scores ~0.5', () => {
    const r = calibrationScore([
      { conviction: 1.0, accuracy: 1.0 },
      { conviction: 1.0, accuracy: 0.0 },
    ]);
    // mean error = (0 + 1) / 2 = 0.5; score = 1 - 0.5 = 0.5
    expect(r?.score).toBeCloseTo(0.5, 6);
    expect(r?.meanError).toBeCloseTo(0.5, 6);
  });

  it('reports hits using the 0.6 accuracy threshold (matches rarity "called it")', () => {
    const r = calibrationScore([
      { conviction: 0.8, accuracy: 0.9 }, // hit
      { conviction: 0.7, accuracy: 0.7 }, // hit
      { conviction: 0.5, accuracy: 0.55 }, // miss (under 0.6)
    ]);
    expect(r?.hits).toBe(2);
    expect(r?.samples).toBe(3);
  });

  it('clamps conviction / accuracy to [0, 1]', () => {
    const r = calibrationScore([
      { conviction: 2.0 as number, accuracy: 1.0 }, // conviction clamps to 1, error=0
      { conviction: -1.0 as number, accuracy: 0.0 }, // conviction clamps to 0, error=0
    ]);
    expect(r?.score).toBeCloseTo(1, 6);
  });

  it('non-finite accuracy is treated as missing', () => {
    const r = calibrationScore([
      { conviction: 0.8, accuracy: Number.NaN },
      { conviction: 0.5, accuracy: 0.5 },
    ]);
    expect(r?.samples).toBe(1);
    expect(r?.score).toBeCloseTo(1, 6);
  });

  it('reports the mean conviction across resolved samples', () => {
    const r = calibrationScore([
      { conviction: 0.4, accuracy: 0.4 },
      { conviction: 0.8, accuracy: 0.8 },
    ]);
    expect(r?.meanConviction).toBeCloseTo(0.6, 6);
  });
});

describe('buildLeaderboard', () => {
  it('groups by username and sorts by calibration score DESC', () => {
    const rows = buildLeaderboard([
      { username: 'sloppy', sample: { conviction: 1.0, accuracy: 0.0 } },
      { username: 'perfect', sample: { conviction: 0.7, accuracy: 0.7 } },
      { username: 'mid', sample: { conviction: 0.8, accuracy: 0.6 } },
    ]);
    expect(rows.map((r) => r.username)).toEqual(['perfect', 'mid', 'sloppy']);
    expect(rows[0].score.score).toBeCloseTo(1, 6);
    expect(rows[2].score.score).toBeCloseTo(0, 6);
  });

  it('drops bettors with zero resolved samples', () => {
    const rows = buildLeaderboard([
      { username: 'phantom', sample: { conviction: 0.9, accuracy: null } },
      { username: 'real', sample: { conviction: 0.7, accuracy: 0.7 } },
    ]);
    expect(rows.map((r) => r.username)).toEqual(['real']);
  });

  it('breaks ties on score using sample count (more samples wins)', () => {
    const rows = buildLeaderboard([
      { username: 'small', sample: { conviction: 0.5, accuracy: 0.5 } },
      { username: 'big', sample: { conviction: 0.5, accuracy: 0.5 } },
      { username: 'big', sample: { conviction: 0.5, accuracy: 0.5 } },
    ]);
    expect(rows[0].username).toBe('big');
    expect(rows[1].username).toBe('small');
  });

  it('breaks final ties alphabetically for stable ordering', () => {
    const rows = buildLeaderboard([
      { username: 'zeta', sample: { conviction: 0.5, accuracy: 0.5 } },
      { username: 'alpha', sample: { conviction: 0.5, accuracy: 0.5 } },
    ]);
    expect(rows.map((r) => r.username)).toEqual(['alpha', 'zeta']);
  });

  it('returns an empty array for empty input', () => {
    expect(buildLeaderboard([])).toEqual([]);
  });

  it('ignores rows with no username', () => {
    const rows = buildLeaderboard([
      { username: '', sample: { conviction: 0.5, accuracy: 0.5 } },
      { username: 'real', sample: { conviction: 0.5, accuracy: 0.5 } },
    ]);
    expect(rows.map((r) => r.username)).toEqual(['real']);
  });
});
