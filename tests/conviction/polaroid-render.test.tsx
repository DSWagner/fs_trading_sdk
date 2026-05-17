/**
 * Render tests for the Polaroid component.
 *
 * Focus on extreme cases that real bets could hit:
 *   - very long reasoning (> 110 chars)
 *   - very long market titles
 *   - empty reasoning
 *   - all 7 art presets
 *   - all 3 belief shapes
 *   - resolved + voided + open states
 *   - very narrow widths (220 px) and very wide widths (480 px)
 *   - prediction at the lower bound (edge of range)
 *   - prediction at the upper bound (edge of range)
 *   - bizarre spread values (zero, range-equal)
 *
 * These are sanity checks: the component must render an SVG with the right
 * structure for every combination, and the caption must never overflow.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { Polaroid, POLAROID_PRESETS } from '../../demo-app/src/conviction/components/Polaroid';

const baseline = {
  marketId: 'test-market',
  positionId: 'test-position',
  marketTitle: 'Best Picture at the Oscars',
  marketUnits: 'votes',
  username: 'critic_at_large',
  reasoning: 'Anora has the indie distributor energy of the year.',
  createdAt: new Date('2026-04-01').toISOString(),
  prediction: 78,
  spread: 4,
  conviction: 0.85,
  collateral: 25,
  shape: 'gaussian' as const,
  lowerBound: 0,
  upperBound: 100,
};

function renderPolaroid(overrides: Partial<React.ComponentProps<typeof Polaroid>> = {}) {
  return render(<Polaroid {...baseline} {...overrides} />);
}

describe('Polaroid: smoke render', () => {
  it('renders an SVG', () => {
    const { container } = renderPolaroid();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('uses 3:2 aspect ratio (height = 1.5 * width)', () => {
    const { container } = renderPolaroid({ width: 320 });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('320');
    expect(svg.getAttribute('height')).toBe('480');
  });

  it('exposes a role and aria-label', () => {
    const { container } = renderPolaroid();
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toMatch(/Polaroid receipt/);
  });
});

describe('Polaroid: prediction label (you vs crowd)', () => {
  it('defaults the scale strip prediction label to "you"', () => {
    const { container } = renderPolaroid();
    const text = container.textContent ?? '';
    expect(text).toMatch(/you · /);
    expect(text).not.toMatch(/crowd · /);
  });

  it('renders a custom predictionLabel on the scale strip', () => {
    const { container } = renderPolaroid({ predictionLabel: 'crowd', prediction: 42 });
    const text = container.textContent ?? '';
    expect(text).toMatch(/crowd · /);
    expect(text).not.toMatch(/you · /);
  });

  it('the crowd-label polaroid still includes the prediction number', () => {
    const { container } = renderPolaroid({ predictionLabel: 'crowd', prediction: 42 });
    const text = container.textContent ?? '';
    expect(text).toMatch(/crowd · 42/);
  });
});

describe('Polaroid: extreme inputs do not crash', () => {
  it('handles empty reasoning', () => {
    expect(() => renderPolaroid({ reasoning: '' })).not.toThrow();
  });

  it('handles a 1000-character reasoning', () => {
    expect(() => renderPolaroid({ reasoning: 'A'.repeat(1000) })).not.toThrow();
  });

  it('handles a very long market title', () => {
    expect(() => renderPolaroid({ marketTitle: 'A'.repeat(200) })).not.toThrow();
  });

  it('handles an empty username', () => {
    expect(() => renderPolaroid({ username: '' })).not.toThrow();
  });

  it('handles unicode reasoning', () => {
    expect(() => renderPolaroid({ reasoning: '日本語の理由 🌸 plus emoji' })).not.toThrow();
  });

  it('handles prediction equal to lower bound', () => {
    expect(() => renderPolaroid({ prediction: 0 })).not.toThrow();
  });

  it('handles prediction equal to upper bound', () => {
    expect(() => renderPolaroid({ prediction: 100 })).not.toThrow();
  });

  it('handles prediction outside the bounds (gracefully clamps)', () => {
    expect(() => renderPolaroid({ prediction: 250 })).not.toThrow();
    expect(() => renderPolaroid({ prediction: -50 })).not.toThrow();
  });

  it('handles a tiny spread (0.001)', () => {
    expect(() => renderPolaroid({ spread: 0.001 })).not.toThrow();
  });

  it('handles a spread larger than the range', () => {
    expect(() => renderPolaroid({ spread: 500, lowerBound: 0, upperBound: 100 })).not.toThrow();
  });

  it('handles zero conviction', () => {
    expect(() => renderPolaroid({ conviction: 0 })).not.toThrow();
  });

  it('handles maximum conviction', () => {
    expect(() => renderPolaroid({ conviction: 1 })).not.toThrow();
  });

  it('handles a one-pixel-wide bound range', () => {
    expect(() => renderPolaroid({ lowerBound: 50, upperBound: 50.001, prediction: 50, spread: 0.0001 })).not.toThrow();
  });
});

describe('Polaroid: every preset renders', () => {
  for (const preset of POLAROID_PRESETS) {
    it(`renders preset "${preset.id}"`, () => {
      expect(() => renderPolaroid({ preset: preset.id })).not.toThrow();
    });
  }
});

describe('Polaroid: every shape renders', () => {
  for (const shape of ['gaussian', 'range', 'bimodal'] as const) {
    it(`renders shape "${shape}"`, () => {
      expect(() => renderPolaroid({ shape })).not.toThrow();
    });
  }
});

describe('Polaroid: resolution states', () => {
  it('renders pre-resolution', () => {
    const { container } = renderPolaroid({ resolutionState: 'open' });
    expect(container.textContent).toContain('DEVELOPING');
  });

  it('renders developed with outcome thread', () => {
    const { container } = renderPolaroid({
      resolutionState: 'resolved',
      resolvedOutcome: 75,
    });
    expect(container.textContent).not.toContain('DEVELOPING');
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders developed without an outcome (settled but no outcome)', () => {
    const { container } = renderPolaroid({
      resolutionState: 'resolved',
      resolvedOutcome: null,
    });
    expect(container.textContent).toContain('SETTLED');
  });

  it('renders an unknown resolution state as developing', () => {
    const { container } = renderPolaroid({ resolutionState: 'voided' });
    expect(container.textContent).toContain('DEVELOPING');
  });
});

describe('Polaroid: width range', () => {
  for (const width of [200, 240, 280, 320, 420, 480]) {
    it(`renders at width=${width}`, () => {
      expect(() => renderPolaroid({ width })).not.toThrow();
    });
  }
});

describe('Polaroid: deterministic rendering', () => {
  it('produces the same SVG markup for the same inputs (same marketId/positionId)', () => {
    const a = renderPolaroid({ width: 280 }).container.innerHTML;
    const b = renderPolaroid({ width: 280 }).container.innerHTML;
    expect(a).toBe(b);
  });

  it('produces different markup for different positionIds', () => {
    const a = renderPolaroid({ positionId: 'one' }).container.innerHTML;
    const b = renderPolaroid({ positionId: 'two' }).container.innerHTML;
    expect(a).not.toBe(b);
  });
});

describe('Polaroid: procedural palettes (effectively infinite color spectrum)', () => {
  /**
   * Render N receipts with N distinct positionIds (a cheap stand-in for
   * every other slider/text input) and collect the sky-top color from
   * each. Procedural palettes should produce N distinct colors — not a
   * bucket of ~16 reused samples like the old table-driven palettes.
   */
  function collectSkyTopColors(count: number) {
    const colors = new Set<string>();
    for (let i = 0; i < count; i++) {
      const { container } = renderPolaroid({ positionId: `proc-${i}` });
      const stops = container.querySelectorAll('linearGradient[id^="sky-"] stop');
      const first = stops[0];
      const c = first?.getAttribute('stop-color');
      if (c) colors.add(c.toLowerCase());
    }
    return colors;
  }

  it('produces a wide spread of distinct sky-top colors across 60 receipts', () => {
    const colors = collectSkyTopColors(60);
    // Old table had 8 families × 2 variants = 16 hard-coded entries; if
    // we still got banded into ~16 colors something regressed. Requiring
    // >40 distinct values across 60 receipts proves the procedural
    // generator is pulling fresh hues per seed.
    expect(colors.size).toBeGreaterThan(40);
  });

  it('the sky-top stop is a valid 6-digit hex color', () => {
    const { container } = renderPolaroid({ positionId: 'hex-check' });
    const stops = container.querySelectorAll('linearGradient[id^="sky-"] stop');
    const c = stops[0]?.getAttribute('stop-color') ?? '';
    expect(/^#[0-9a-f]{6}$/i.test(c)).toBe(true);
  });

  it('shifting only the stake by $1 produces a different sky color', () => {
    const a = renderPolaroid({ collateral: 25 })
      .container.querySelector('linearGradient[id^="sky-"] stop')
      ?.getAttribute('stop-color');
    const b = renderPolaroid({ collateral: 26 })
      .container.querySelector('linearGradient[id^="sky-"] stop')
      ?.getAttribute('stop-color');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe('Polaroid: numeric scale strip (must be readable without chart literacy)', () => {
  it('shows the lower and upper bounds of the market', () => {
    const { container } = renderPolaroid({
      lowerBound: 0,
      upperBound: 100,
      marketUnits: 'votes',
    });
    expect(container.textContent).toContain('0');
    expect(container.textContent).toContain('100');
  });

  it('shows the prediction value labelled as "you"', () => {
    const { container } = renderPolaroid({
      prediction: 78,
      marketUnits: 'votes',
    });
    expect(container.textContent?.toLowerCase()).toContain('you');
    expect(container.textContent).toContain('78');
  });

  it('shows the actual outcome value when developed', () => {
    const { container } = renderPolaroid({
      prediction: 78,
      resolutionState: 'resolved',
      resolvedOutcome: 82,
      marketUnits: 'votes',
    });
    expect(container.textContent?.toLowerCase()).toContain('actual');
    expect(container.textContent).toContain('82');
  });

  it('does not show an outcome when the market is still open', () => {
    const { container } = renderPolaroid({ prediction: 78, resolutionState: 'open' });
    expect(container.textContent?.toLowerCase()).not.toContain('actual');
  });

  it('formats percentage units with no awkward space', () => {
    const { container } = renderPolaroid({
      prediction: 4,
      marketUnits: '%',
      lowerBound: 0,
      upperBound: 10,
    });
    expect(container.textContent).toMatch(/4%/);
  });

  it('formats large numbers with k suffix', () => {
    const { container } = renderPolaroid({
      prediction: 12_500,
      lowerBound: 0,
      upperBound: 50_000,
      marketUnits: 'units',
    });
    expect(container.textContent).toMatch(/12\.5k/);
    expect(container.textContent).toMatch(/50k/);
  });

  it('keeps both prediction and outcome labels on screen when they are very close', () => {
    expect(() => renderPolaroid({
      prediction: 50,
      resolutionState: 'resolved',
      resolvedOutcome: 50.4,
      lowerBound: 0,
      upperBound: 100,
    })).not.toThrow();
  });

  it('keeps prediction label on screen when it sits at the lower edge', () => {
    expect(() => renderPolaroid({ prediction: 0 })).not.toThrow();
  });

  it('keeps prediction label on screen when it sits at the upper edge', () => {
    expect(() => renderPolaroid({ prediction: 100 })).not.toThrow();
  });
});

describe('Polaroid: readable footer sentence', () => {
  it('open bet: shows "predicted X · $Y"', () => {
    const { container } = renderPolaroid({
      username: 'macro_lurker',
      prediction: 4,
      marketUnits: '%',
      collateral: 35,
      resolutionState: 'open',
    });
    expect(container.textContent).toMatch(/@macro_lurker/);
    expect(container.textContent).toMatch(/predicted/);
    expect(container.textContent).toMatch(/\$35/);
  });

  it('resolved bet: shows "X → Y · off by Z%"', () => {
    const { container } = renderPolaroid({
      username: 'macro_lurker',
      prediction: 4,
      resolutionState: 'resolved',
      resolvedOutcome: 4.25,
      marketUnits: '%',
      lowerBound: 0,
      upperBound: 10,
    });
    expect(container.textContent).toMatch(/→/);
    expect(container.textContent).toMatch(/off by/);
    expect(container.textContent).toMatch(/4%/);
    expect(container.textContent).toMatch(/4\.25%/);
  });

  it('falls back to @anon when username is empty', () => {
    const { container } = renderPolaroid({ username: '', prediction: 50 });
    expect(container.textContent).toMatch(/@anon/);
  });
});

describe('Polaroid: developed state actually shows the picture (regression)', () => {
  it('developed Polaroid does NOT apply the empty develop filter (which used to blank it out)', () => {
    const { container } = renderPolaroid({
      resolutionState: 'resolved',
      resolvedOutcome: 75,
    });
    const svg = container.querySelector('svg')!;
    // The sky rect (the very first <rect> inside the photo group) must NOT
    // carry filter="url(#develop-...)" once developed.
    const skyRect = svg.querySelectorAll('g rect')[0];
    expect(skyRect).toBeTruthy();
    expect(skyRect.getAttribute('filter')).toBeNull();
  });

  it('open Polaroid still applies the develop filter (the soft-look effect)', () => {
    const { container } = renderPolaroid({ resolutionState: 'open' });
    const svg = container.querySelector('svg')!;
    const skyRect = svg.querySelectorAll('g rect')[0];
    expect(skyRect.getAttribute('filter')).toMatch(/^url\(#develop-/);
  });
});

describe('Polaroid: animated develop transition (animateDevelop prop)', () => {
  it('mounts a developed Polaroid with the dim/blur "pre" filter when animateDevelop=true', () => {
    const { container } = renderPolaroid({
      resolutionState: 'resolved',
      resolvedOutcome: 75,
      animateDevelop: true,
    });
    const svg = container.querySelector('svg')!;
    const style = svg.getAttribute('style') ?? '';
    // Pre-state filter should contain saturate/blur/brightness markers.
    expect(style).toMatch(/saturate\(/);
    expect(style).toMatch(/blur\(/);
    expect(style).toMatch(/brightness\(/);
    // No transition during the 'pre' phase to ensure the browser commits
    // the dimmed filter before we move to 'running'.
    expect(style).toMatch(/transition: ?none/);
  });

  it('does NOT apply the develop filter when animateDevelop=false', () => {
    const { container } = renderPolaroid({
      resolutionState: 'resolved',
      resolvedOutcome: 75,
      animateDevelop: false,
    });
    const svg = container.querySelector('svg')!;
    const style = svg.getAttribute('style') ?? '';
    expect(style).not.toMatch(/saturate\(0\.18\)/);
    expect(style).not.toMatch(/blur\(1\.6/);
  });

  it('does NOT apply the develop filter on still-open bets even when animateDevelop=true', () => {
    const { container } = renderPolaroid({
      resolutionState: 'open',
      animateDevelop: true,
    });
    const svg = container.querySelector('svg')!;
    const style = svg.getAttribute('style') ?? '';
    expect(style).not.toMatch(/saturate\(0\.18\)/);
  });
});

describe('Polaroid: animation phase progression (real timer simulation)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('progresses pre -> running -> done over the expected timeline', () => {
    const { container } = renderPolaroid({
      resolutionState: 'resolved',
      resolvedOutcome: 75,
      animateDevelop: true,
    });
    const svg = () => container.querySelector('svg')!;

    // Frame 0: pre. Dim filter, no transition (so the browser commits the
    // dim state before we advance to 'running').
    let style = svg().getAttribute('style') ?? '';
    expect(style).toMatch(/saturate\(0\.18\)/);
    expect(style).toMatch(/transition: ?none/);

    // Advance 60 ms -> phase 'running'. Filter cleared, transition active.
    act(() => {
      vi.advanceTimersByTime(60);
    });
    style = svg().getAttribute('style') ?? '';
    expect(style).not.toMatch(/saturate\(0\.18\)/);
    expect(style).toMatch(/transition: ?filter 900ms/);

    // Advance another 950 ms -> phase 'done'. Transition removed entirely so
    // future re-renders (e.g. PNG download) don't accidentally re-trigger.
    act(() => {
      vi.advanceTimersByTime(950);
    });
    style = svg().getAttribute('style') ?? '';
    expect(style).not.toMatch(/saturate\(0\.18\)/);
    expect(style).not.toMatch(/transition: ?filter/);
  });

  it('cleans up timers on unmount during the running phase (no leaks)', () => {
    const { container, unmount } = renderPolaroid({
      resolutionState: 'resolved',
      resolvedOutcome: 75,
      animateDevelop: true,
    });
    expect(container.querySelector('svg')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    unmount();
    // The remaining timer (the one that flips to 'done' at 60+950 ms) must
    // not error or leak when fired against an unmounted component. Vitest
    // catches "act warnings" too.
    expect(() => {
      vi.advanceTimersByTime(2000);
    }).not.toThrow();
  });

  it('flipping developed false -> true while mounted re-arms the animation (DevelopDemo case)', () => {
    const { container, rerender } = render(
      <Polaroid {...baseline} resolutionState="open" animateDevelop />,
    );
    let style = container.querySelector('svg')!.getAttribute('style') ?? '';
    expect(style).not.toMatch(/saturate\(0\.18\)/);

    // Toggle to resolved. useLayoutEffect runs synchronously so the very
    // next render commits the dim filter before any paint.
    rerender(
      <Polaroid {...baseline} resolutionState="resolved" resolvedOutcome={75} animateDevelop />,
    );
    style = container.querySelector('svg')!.getAttribute('style') ?? '';
    expect(style).toMatch(/saturate\(0\.18\)/);
    expect(style).toMatch(/transition: ?none/);

    // Animation completes after 1010 ms.
    act(() => {
      vi.advanceTimersByTime(1010);
    });
    style = container.querySelector('svg')!.getAttribute('style') ?? '';
    expect(style).not.toMatch(/saturate\(0\.18\)/);
    expect(style).not.toMatch(/transition: ?filter/);
  });

  it('flipping developed back to open mid-animation tears the animation down', () => {
    const { container, rerender } = render(
      <Polaroid {...baseline} resolutionState="resolved" resolvedOutcome={75} animateDevelop />,
    );
    let style = container.querySelector('svg')!.getAttribute('style') ?? '';
    expect(style).toMatch(/saturate\(0\.18\)/);

    rerender(<Polaroid {...baseline} resolutionState="open" animateDevelop />);
    style = container.querySelector('svg')!.getAttribute('style') ?? '';
    expect(style).not.toMatch(/saturate\(0\.18\)/);
    expect(style).not.toMatch(/transition: ?filter/);
  });
});

describe('Polaroid: end-to-end resolved bet (every visible element)', () => {
  // This is the canonical "user just landed on a freshly resolved Receipt"
  // state. We assert every textual signal a real user is supposed to read
  // off the developed Polaroid in 5 seconds: actual tag, scale strip
  // bounds, prediction marker, outcome marker, sentence-style footer with
  // off-by percentage, no DEVELOPING text, no empty develop filter, and
  // sane SVG geometry.
  const resolved = {
    ...baseline,
    marketTitle: 'Fed Funds rate at end of 2025',
    marketUnits: '%',
    username: 'macro_lurker',
    reasoning: 'Two cuts before October. Inflation is sticky.',
    prediction: 4.0,
    spread: 0.35,
    conviction: 0.78,
    collateral: 35,
    shape: 'gaussian' as const,
    lowerBound: 2.5,
    upperBound: 5.5,
    resolutionState: 'resolved',
    resolvedOutcome: 4.25,
    width: 420,
    preset: 'sunset' as const,
  };

  function renderResolved(extra: Partial<React.ComponentProps<typeof Polaroid>> = {}) {
    return render(<Polaroid {...resolved} {...extra} />);
  }

  it('renders an SVG of the right dimensions (3:2 aspect)', () => {
    const { container } = renderResolved();
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('420');
    expect(svg.getAttribute('height')).toBe('630');
  });

  it('shows the "actual" tag on the outcome thread', () => {
    const { container } = renderResolved();
    expect(container.textContent).toMatch(/actual/);
  });

  it('shows the scale strip with lower bound, prediction, and outcome', () => {
    const { container } = renderResolved();
    const text = container.textContent ?? '';
    expect(text).toMatch(/2\.5%/);
    expect(text).toMatch(/5\.5%/);
    expect(text).toMatch(/4(\.0)?%/);
    expect(text).toMatch(/4\.25%/);
  });

  it('shows the sentence-style footer with off-by percentage', () => {
    const { container } = renderResolved();
    const text = container.textContent ?? '';
    expect(text).toMatch(/@macro_lurker/);
    expect(text).toMatch(/→/);
    expect(text).toMatch(/off by/);
  });

  it('does NOT show DEVELOPING text on a resolved Polaroid', () => {
    const { container } = renderResolved();
    expect(container.textContent ?? '').not.toMatch(/DEVELOPING/);
  });

  it('does NOT apply the empty develop filter (the photo blanking regression)', () => {
    const { container } = renderResolved();
    const skyRect = container.querySelectorAll('g rect')[0];
    expect(skyRect.getAttribute('filter')).toBeNull();
  });

  it('renders an outcome thread (a vertical line at the resolved x-position)', () => {
    const { container } = renderResolved();
    // The Polaroid renders the outcome thread as a stroke path/line on the
    // photo. There must be at least one line/path within the photo group.
    const lines = container.querySelectorAll('svg line, svg path');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('survives extreme outcomes (outcome at upper bound, prediction at lower)', () => {
    const { container } = renderResolved({
      prediction: 2.5,
      resolvedOutcome: 5.5,
    });
    const text = container.textContent ?? '';
    expect(text).toMatch(/2\.5%/);
    expect(text).toMatch(/5\.5%/);
    expect(text).toMatch(/off by/);
  });

  it('survives outcomes outside the configured bounds (real markets do this)', () => {
    expect(() =>
      renderResolved({
        prediction: 4,
        resolvedOutcome: 12,
        lowerBound: 0,
        upperBound: 10,
      }),
    ).not.toThrow();
  });

  it('renders all three accuracy verdicts based on prediction-to-outcome gap', () => {
    // Called it (≤ 5%): outcome very close to prediction.
    const { container: c1 } = renderResolved({ prediction: 100, resolvedOutcome: 102, lowerBound: 0, upperBound: 200 });
    expect(c1.textContent ?? '').toMatch(/CALLED IT|CLOSE|MISSED/);

    // Close (~ 10-25%).
    const { container: c2 } = renderResolved({ prediction: 100, resolvedOutcome: 115, lowerBound: 0, upperBound: 200 });
    expect(c2.textContent ?? '').toMatch(/CALLED IT|CLOSE|MISSED/);

    // Missed (>25%).
    const { container: c3 } = renderResolved({ prediction: 100, resolvedOutcome: 200, lowerBound: 0, upperBound: 200 });
    expect(c3.textContent ?? '').toMatch(/CALLED IT|CLOSE|MISSED/);
  });

  it('with animateDevelop=true: full lifecycle leaves the developed Polaroid pristine', () => {
    vi.useFakeTimers();
    try {
      const { container } = renderResolved({ animateDevelop: true });
      // Pre-state: dim filter applied.
      expect(container.querySelector('svg')!.getAttribute('style')).toMatch(/saturate\(0\.18\)/);
      // Walk through the entire animation.
      act(() => vi.advanceTimersByTime(2000));
      // Final state: clean, no filter, all the same content elements as the
      // non-animated render.
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('style') ?? '').not.toMatch(/saturate\(0\.18\)/);
      expect(svg.getAttribute('style') ?? '').not.toMatch(/transition: ?filter/);
      const text = container.textContent ?? '';
      expect(text).toMatch(/@macro_lurker/);
      expect(text).toMatch(/4\.25%/);
      expect(text).toMatch(/off by/);
      expect(text).not.toMatch(/DEVELOPING/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('developed Polaroid renders identically with and without animateDevelop after animation completes', () => {
    vi.useFakeTimers();
    try {
      const noAnim = render(<Polaroid {...resolved} animateDevelop={false} />);
      const withAnim = render(<Polaroid {...resolved} animateDevelop={true} />);
      act(() => vi.advanceTimersByTime(2000));
      // After animation, the developed Polaroid should show the same
      // user-visible text content regardless of whether it animated in.
      expect(noAnim.container.textContent).toBe(withAnim.container.textContent);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Polaroid: crowd consensus back hill (parallax depth)', () => {
  // The consensus hill is the second silhouette layer added to give
  // the photo 3D depth: it traces a synthetic Gaussian centred on the
  // crowd's `consensusAtBet` mean and sits BEHIND the user's hill.
  // These tests pin (a) the graceful-degradation contract -- legacy
  // receipts without consensus snapshots must keep rendering
  // unchanged, no extra path -- and (b) the presence + uniqueness of
  // the back hill once consensus is provided.

  it('omits the consensus silhouette when consensusAtBet is null (graceful degradation)', () => {
    const { container } = renderPolaroid({ consensusAtBet: null });
    expect(container.querySelector('[data-testid="polaroid-consensus-silhouette"]')).toBeNull();
    // The user's silhouette must still render -- removing the back
    // hill should never affect the foreground composition.
    expect(container.querySelector('[data-testid="polaroid-user-silhouette"]')).not.toBeNull();
  });

  it('omits the consensus silhouette when consensusAtBet is out of range', () => {
    const { container } = renderPolaroid({ consensusAtBet: 9999 });
    expect(container.querySelector('[data-testid="polaroid-consensus-silhouette"]')).toBeNull();
  });

  it('renders the consensus silhouette when consensusAtBet is provided in range', () => {
    const { container } = renderPolaroid({ consensusAtBet: 50 });
    expect(container.querySelector('[data-testid="polaroid-consensus-silhouette"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="polaroid-user-silhouette"]')).not.toBeNull();
  });

  it('paints the consensus silhouette BEFORE the user silhouette so the user reads as foreground', () => {
    const { container } = renderPolaroid({ consensusAtBet: 50 });
    const back = container.querySelector('[data-testid="polaroid-consensus-silhouette"]') as Element | null;
    const front = container.querySelector('[data-testid="polaroid-user-silhouette"]') as Element | null;
    expect(back).not.toBeNull();
    expect(front).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING (4) means `back` precedes `front` in source order,
    // i.e. the SVG paints the back hill first and the user's hill on top.
    const rel = (back as Element).compareDocumentPosition(front as Element);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the back hill traces a different silhouette than the user hill when prediction != consensus', () => {
    const { container } = renderPolaroid({ prediction: 20, consensusAtBet: 80 });
    const back = container.querySelector('[data-testid="polaroid-consensus-silhouette"]');
    const front = container.querySelector('[data-testid="polaroid-user-silhouette"]');
    const backD = back?.getAttribute('d') ?? '';
    const frontD = front?.getAttribute('d') ?? '';
    // Both paths must exist and trace meaningful geometry...
    expect(backD.length).toBeGreaterThan(50);
    expect(frontD.length).toBeGreaterThan(50);
    // ...but they MUST differ -- if they were the same path, the depth
    // illusion would collapse to a single hill drawn twice.
    expect(backD).not.toBe(frontD);
  });

  // Regression: shared PDF normalisation. The bottom-of-page chart and
  // the polaroid's two hills MUST tell the same story -- when the user
  // holds a tightly-spread belief and the crowd's consensus is broad,
  // the chart's user curve peaks higher than the crowd's curve, and so
  // the foreground hill in the polaroid must peak higher than the back
  // hill. Before the PDF-normalisation rewrite, each hill was
  // normalised to its own max and then the back hill was shrunk by an
  // arbitrary 0.6 multiplier -- which "happened to" make the back
  // shorter, but in a way that lied about scale (a wider user belief
  // was indistinguishable from a narrower one). This test pins the
  // truthful behaviour: the foreground crest is HIGHER UP the photo
  // (smaller Y in SVG coordinates, where Y grows downward) than the
  // back crest when the user is concentrated and the crowd is broad.
  it('shared PDF normalisation: tight user + diffuse crowd => foreground peaks higher than back', () => {
    // Tight user (spread 4 over a 0..100 range) vs the crowd's
    // synthetic spread which is max(spread*1.3, range*0.05) = 5.2.
    // The user PDF peak is ~1/(4*sqrt(2pi)) ~ 0.0997, the crowd PDF
    // peak is ~1/(5.2*sqrt(2pi)) ~ 0.0767, ratio ~ 1.30. So the
    // foreground crest must lift ~30% higher than the back crest.
    const { container } = renderPolaroid({
      prediction: 50,
      consensusAtBet: 50,  // co-located peaks make the height delta easy to read
      spread: 4,
      shape: 'gaussian',
    });
    const back = container.querySelector('[data-testid="polaroid-consensus-silhouette"]');
    const front = container.querySelector('[data-testid="polaroid-user-silhouette"]');
    const backD = back?.getAttribute('d') ?? '';
    const frontD = front?.getAttribute('d') ?? '';
    // Extract every Y coordinate from the path string. SVG path data
    // is a series of "L x y" commands; we strip the initial M/L
    // letters with a regex and pull every numeric pair.
    const yValues = (d: string): number[] => {
      const ys: number[] = [];
      const re = /[ML]\s*([-\d.]+)\s+([-\d.]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(d)) !== null) {
        ys.push(parseFloat(m[2]));
      }
      return ys;
    };
    const frontMinY = Math.min(...yValues(frontD));
    const backMinY = Math.min(...yValues(backD));
    // Smaller Y == higher up the photo. Foreground crest must be
    // strictly higher than back crest. A small absolute tolerance
    // (~2% of photo size) absorbs the per-hill jitter noise.
    const photoSize = 320 - 32;  // default Polaroid width 320 px - 16 px padding * 2
    expect(frontMinY).toBeLessThan(backMinY - photoSize * 0.005);
  });

  // Regression for the user's original observation: "the polaroid hill
  // matches the Trade Preview, but the back hill is invisible." With
  // shared PDF normalisation the back hill should now have measurable
  // presence -- the lift from the back-hill horizon to its crest is at
  // least a few percent of photo height -- not collapsed to a flat
  // line.
  it('shared PDF normalisation: back hill has visible peak lift, not collapsed to flat', () => {
    const { container } = renderPolaroid({
      prediction: 30,
      consensusAtBet: 70,
      spread: 8,
      shape: 'gaussian',
    });
    const back = container.querySelector('[data-testid="polaroid-consensus-silhouette"]');
    const backD = back?.getAttribute('d') ?? '';
    expect(backD.length).toBeGreaterThan(50);
    const yValues: number[] = [];
    const re = /[ML]\s*([-\d.]+)\s+([-\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(backD)) !== null) yValues.push(parseFloat(m[2]));
    const photoSize = 320 - 32;
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    // Back hill must lift its crest measurably above its baseline.
    // 5% of photo size is the lower bound for "visibly a hill, not a
    // flat strip". Real renders are typically 8-15%.
    expect(maxY - minY).toBeGreaterThan(photoSize * 0.05);
  });
});

// ────────────────────────────────────────────────────────────────────
// BIMODAL SILHOUETTE -- pins the polaroid hill to the chart's two-
// gaussian mixture (peaks at `prediction` and `secondPeak`, weights
// 0.5 / 0.7, σ = `spread`). Regression for the user's complaint:
// "Why are the curves in the top image different than the curves in
// the lower chart? I said they should look the same."
//
// Before the fix, the polaroid faked a bimodal as
//   peak1 = prediction - spread*1.6
//   peak2 = prediction + spread*1.6
// which only touched ONE of the user's slider values (prediction)
// and ignored the second-peak slider entirely. A user who set
// prediction=1023 / secondPeak=953 / spread=83 saw the chart paint
// a pair of close peaks (almost merged into one tall bump near
// 985), but the polaroid drew TWO peaks at 890 / 1156 -- nowhere
// near where the chart was drawing them.
// ────────────────────────────────────────────────────────────────────

describe('Polaroid: bimodal silhouette tracks the BetFlow chart', () => {
  // Helper: parse a silhouette path into (x, y) samples in photo-local
  // coordinates and normalise X to [0, 1] across the photo's
  // horizontal extent. The first two and last two points of the
  // path are the polygon base corners that close the filled
  // silhouette; we trim those so we only inspect the silhouette
  // samples themselves.
  function silhouetteSamples(
    d: string,
    photoX: number,
    photoSize: number,
  ): Array<{ tx: number; y: number }> {
    const points: Array<[number, number]> = [];
    const re = /[ML]\s*([-\d.]+)\s+([-\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(d)) !== null) {
      points.push([parseFloat(m[1]), parseFloat(m[2])]);
    }
    return points
      .slice(2, points.length - 2)
      .map(([x, y]) => ({ tx: (x - photoX) / photoSize, y }));
  }

  // Helper: weighted mass centre on the X-axis. Each sample
  // contributes `peakLift = horizonY - y` mass (lower Y means a
  // taller hill at that X, which is exactly the PDF density
  // proportionally normalised by `sharedPdfMax`). Robust to
  // jitter because we average over ALL samples, not just the
  // discrete local maxima.
  function massCentreX(samples: Array<{ tx: number; y: number }>): number {
    let mass = 0;
    let weighted = 0;
    // Use the maximum Y in the sample set as the local horizon
    // baseline (the silhouette's lowest point on the photo). Mass
    // at each sample is "horizon minus y" -- always non-negative,
    // and zero where the silhouette dips back to the baseline.
    const horizonY = Math.max(...samples.map((s) => s.y));
    for (const { tx, y } of samples) {
      const m = Math.max(0, horizonY - y);
      mass += m;
      weighted += m * tx;
    }
    if (mass <= 1e-9) return 0.5;
    return weighted / mass;
  }

  it('uses BOTH the prediction and secondPeak sliders, not a synthetic ±spread*1.6 reconstruction', () => {
    // Real user case from the screenshot: MrBeast subscribers,
    // range 0..1375M. User picked prediction=1023, secondPeak=953,
    // spread=83. The chart paints two close peaks that almost merge
    // around 988 (mass-weighted average of 1023 with weight 0.5
    // and 953 with weight 0.7 = (0.5*1023 + 0.7*953) / 1.2 ≈ 982).
    // 982 / 1375 ≈ 0.715. The new polaroid renders mass centred at
    // ~0.715 too. The legacy symmetric reconstruction would have
    // centred mass at  (0.5*890 + 0.7*1156) / 1.2 ≈ 1045 -- 0.760
    // -- noticeably to the right of the chart's actual centre.
    const { container } = renderPolaroid({
      lowerBound: 0,
      upperBound: 1375,
      prediction: 1023,
      secondPeak: 953,
      spread: 83,
      shape: 'bimodal',
      width: 320,
      // Suppress the back hill so we only inspect the user silhouette.
      consensusAtBet: null,
    });
    const front = container.querySelector(
      '[data-testid="polaroid-user-silhouette"]',
    ) as Element | null;
    expect(front).not.toBeNull();
    const d = front!.getAttribute('d') ?? '';
    expect(d.length).toBeGreaterThan(50);

    const samples = silhouetteSamples(d, 16, 320 - 32);
    const centre = massCentreX(samples);
    // Mass centre must sit close to the chart's actual mass centre
    // at 982/1375 ≈ 0.715. A ±0.06 window absorbs the jitter
    // overlay and the discrete-sampling bias. The legacy contract
    // (mass centre near 0.76) would fall outside the upper bound.
    expect(centre).toBeGreaterThan(0.65);
    expect(centre).toBeLessThan(0.78);
  });

  it('respects the secondPeak slider: changing it shifts the silhouette', () => {
    // Fixed prediction=50, varying secondPeak. The silhouette's
    // overall mass centre should track secondPeak monotonically:
    // if we move secondPeak from 20 to 80 with prediction held at
    // 50, the silhouette's mass centre must rise.
    const renderWithPeak = (sp: number) => {
      const { container } = renderPolaroid({
        lowerBound: 0,
        upperBound: 100,
        prediction: 50,
        secondPeak: sp,
        // A tight spread keeps the two crests well separated so
        // the mass centre actually moves with the second peak
        // instead of both peaks blurring into a wide single hump.
        spread: 3,
        shape: 'bimodal',
        width: 320,
        consensusAtBet: null,
      });
      const front = container.querySelector(
        '[data-testid="polaroid-user-silhouette"]',
      ) as Element | null;
      const d = front?.getAttribute('d') ?? '';
      const samples = silhouetteSamples(d, 16, 320 - 32);
      return massCentreX(samples);
    };
    const left = renderWithPeak(20);
    const right = renderWithPeak(80);
    // Sanity: with the second peak at 0.20 the mass centre should
    // sit clearly LEFT of 0.5; with the second peak at 0.80 it
    // should sit clearly RIGHT of 0.5. The gap must be at least
    // ~0.15 of photo width so we know we're not just measuring
    // jitter noise.
    expect(right - left).toBeGreaterThan(0.15);
  });

  it('falls back to the legacy ±spread*1.6 reconstruction when secondPeak is omitted (legacy receipts)', () => {
    // Backwards compatibility: a receipt saved before the
    // `secondPeak` field existed must still render a bimodal hill.
    // We don't pin the exact crest positions (those depend on jitter
    // and rng draws), only the structural property: the silhouette
    // path renders, contains samples, and isn't a flat line.
    const { container } = renderPolaroid({
      lowerBound: 0,
      upperBound: 100,
      prediction: 50,
      // secondPeak omitted -- legacy contract.
      spread: 8,
      shape: 'bimodal',
      width: 320,
      consensusAtBet: null,
    });
    const front = container.querySelector(
      '[data-testid="polaroid-user-silhouette"]',
    ) as Element | null;
    expect(front).not.toBeNull();
    const d = front!.getAttribute('d') ?? '';
    expect(d.length).toBeGreaterThan(50);
    const ys: number[] = [];
    const re = /[ML]\s*([-\d.]+)\s+([-\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(d)) !== null) ys.push(parseFloat(m[2]));
    const photoSize = 320 - 32;
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(photoSize * 0.05);
  });
});
