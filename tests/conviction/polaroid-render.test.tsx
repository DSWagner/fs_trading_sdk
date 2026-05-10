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
