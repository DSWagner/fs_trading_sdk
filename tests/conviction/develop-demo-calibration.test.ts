/**
 * Calibration guard for the marketing DevelopDemo (`The receipt
 * develops` section on the landing page).
 *
 * The demo intentionally toggles a single polaroid between its
 * developing and developed states so the visitor sees the
 * faint -> sharp transformation. For that visual story to read
 * cleanly, the RARITY TIER must be identical in both states —
 * otherwise the toggle reads as "the colour changed" instead of
 * "the polaroid developed" and the section's promise ("the reasoning
 * never changes; the verdict does") gets muddied.
 *
 * The pinned numbers live in `DevelopDemo.tsx`. This test recomputes
 * the rarity in both states and asserts they match. If a future tweak
 * (e.g. changing the demo outcome to highlight CALLED IT) breaks the
 * invariant, this test fails and the author has to either keep the
 * tier aligned or update the demo copy.
 */
import { describe, expect, it } from 'vitest';
import { calculateRarity, potentialRarity } from '../../demo-app/src/conviction/rarity';

// Mirror of the inputs hard-coded in DevelopDemo.tsx. If those values
// change, update them here too — this test is the safety net that
// makes that update conscious.
const demoInputs = {
  prediction: 4.0,
  consensusAtBet: 4.9,
  resolvedOutcome: 4.25,
  lowerBound: 2.5,
  upperBound: 5.5,
};

describe('DevelopDemo rarity calibration', () => {
  it('open state lands in EPIC (potential tier)', () => {
    const tier = potentialRarity({
      prediction: demoInputs.prediction,
      consensusMean: demoInputs.consensusAtBet,
      lowerBound: demoInputs.lowerBound,
      upperBound: demoInputs.upperBound,
    });
    expect(tier).toBe('epic');
  });

  it('resolved state ALSO lands in EPIC (actual tier matches potential)', () => {
    const r = calculateRarity({
      prediction: demoInputs.prediction,
      resolvedOutcome: demoInputs.resolvedOutcome,
      consensusMean: demoInputs.consensusAtBet,
      lowerBound: demoInputs.lowerBound,
      upperBound: demoInputs.upperBound,
    });
    expect(r.tier).toBe('epic');
  });

  it('resolved accuracy stays in the CLOSE band (0.4 < a <= 0.7)', () => {
    const r = calculateRarity({
      prediction: demoInputs.prediction,
      resolvedOutcome: demoInputs.resolvedOutcome,
      consensusMean: demoInputs.consensusAtBet,
      lowerBound: demoInputs.lowerBound,
      upperBound: demoInputs.upperBound,
    });
    // The label thresholds in Polaroid.tsx:
    //   > 0.7  -> CALLED IT
    //   > 0.4  -> CLOSE
    // We want CLOSE so the demo teaches that contrarian + close still
    // earns a rare polaroid; otherwise the verdict line is just
    // CALLED IT and the lesson is muted.
    expect(r.accuracy).toBeGreaterThan(0.4);
    expect(r.accuracy).toBeLessThanOrEqual(0.7);
  });
});
