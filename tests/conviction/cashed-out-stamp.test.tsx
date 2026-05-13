/**
 * Render tests for the CashedOutStamp overlay.
 *
 * Coverage:
 *   - Renders "CASHED OUT" headline regardless of P&L sign.
 *   - Positive P&L renders a "+$X.XX REALIZED" subline.
 *   - Negative P&L renders a "-$X.XX REALIZED" subline.
 *   - Flat (< 0.5 cent) P&L renders the "BREAK EVEN" subline.
 *   - The animateLanding flag conditionally attaches the landing
 *     keyframe animation property on the wrapper element.
 *   - The stamp scales with `polaroidWidth` (text sized from a fixed
 *     fraction of width).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CashedOutStamp } from '../../demo-app/src/conviction/components/CashedOutStamp';

describe('CashedOutStamp', () => {
  it('always renders the CASHED OUT headline', () => {
    const { getByText } = render(
      <CashedOutStamp polaroidWidth={420} realizedPnl={5} />,
    );
    expect(getByText('CASHED OUT')).toBeTruthy();
  });

  it('renders "+$X.XX REALIZED" for a positive realized P&L', () => {
    const { getByText } = render(
      <CashedOutStamp polaroidWidth={420} realizedPnl={8.25} />,
    );
    expect(getByText('+$8.25 REALIZED')).toBeTruthy();
  });

  it('renders "-$X.XX REALIZED" for a negative realized P&L', () => {
    const { getByText } = render(
      <CashedOutStamp polaroidWidth={420} realizedPnl={-3.5} />,
    );
    expect(getByText('-$3.50 REALIZED')).toBeTruthy();
  });

  it('renders BREAK EVEN when the realized P&L is below half a cent', () => {
    const { getByText } = render(
      <CashedOutStamp polaroidWidth={420} realizedPnl={0.001} />,
    );
    expect(getByText('BREAK EVEN')).toBeTruthy();
  });

  it('animateLanding=true attaches the landing animation to the wrapper', () => {
    const { getByTestId } = render(
      <CashedOutStamp polaroidWidth={420} realizedPnl={5} animateLanding />,
    );
    const el = getByTestId('cashed-out-stamp') as HTMLElement;
    expect(el.style.animation).toMatch(/conviction-stamp-land/);
  });

  it('animateLanding=false (default) omits the landing animation', () => {
    const { getByTestId } = render(
      <CashedOutStamp polaroidWidth={420} realizedPnl={5} />,
    );
    const el = getByTestId('cashed-out-stamp') as HTMLElement;
    expect(el.style.animation).toBe('');
  });

  it('scales text with polaroidWidth (larger polaroid -> larger stamp font)', () => {
    const { unmount, getByText } = render(
      <CashedOutStamp polaroidWidth={200} realizedPnl={5} />,
    );
    const smallSize = parseInt(
      (getByText('CASHED OUT') as HTMLElement).style.fontSize,
      10,
    );
    unmount();
    const big = render(<CashedOutStamp polaroidWidth={600} realizedPnl={5} />);
    const bigSize = parseInt(
      (big.getByText('CASHED OUT') as HTMLElement).style.fontSize,
      10,
    );
    expect(bigSize).toBeGreaterThan(smallSize);
  });
});
