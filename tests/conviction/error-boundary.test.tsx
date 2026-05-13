/**
 * @vitest-environment jsdom
 *
 * ErrorBoundary tests.
 *
 * Pins the editorial-grade behaviour we need:
 *   1. A thrown error renders the editorial fallback (not a blank page).
 *   2. The fallback exposes the route label, an error summary, and a
 *      reset CTA.
 *   3. resetKeys flip resets the boundary back to its happy path.
 *   4. A custom fallback render prop replaces the default UI when
 *      provided.
 *   5. componentDidCatch logs through console.error (which is the
 *      single side effect this class allows itself).
 *
 * React logs thrown errors during render at error level by default;
 * we silence console.error for the duration of these tests because
 * the noise is expected and would otherwise drown out real failures.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../../demo-app/src/conviction/components/ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('intentional explosion');
  }
  return <div data-testid="happy-path">All good.</div>;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
  cleanup();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('happy-path')).toBeTruthy();
  });

  it('renders the editorial fallback when a child throws during render', () => {
    render(
      <ErrorBoundary label="RECEIPT">
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    const fallback = screen.getByTestId('error-boundary-fallback');
    expect(fallback).toBeTruthy();
    expect(fallback.textContent).toMatch(/RECEIPT · COULD NOT LOAD/);
    expect(fallback.textContent).toMatch(/Something on this page tripped/);
    // The reset button is rendered.
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    // A "back to the front" recovery link is offered.
    expect(screen.getByRole('link', { name: /back to the front/i })).toBeTruthy();
  });

  it('exposes the error message in a collapsible details section', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    const fallback = screen.getByTestId('error-boundary-fallback');
    expect(fallback.textContent).toMatch(/intentional explosion/);
  });

  it('logs to console.error so devtools and host telemetry see the crash', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    const allLoggedMessages = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allLoggedMessages).toMatch(/Conviction\] Route render crashed/);
  });

  it('renders a custom fallback render prop when provided', () => {
    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <button data-testid="custom-fallback" onClick={reset}>
            Custom fallback for: {error.message}
          </button>
        )}
      >
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    const customFallback = screen.getByTestId('custom-fallback');
    expect(customFallback).toBeTruthy();
    expect(customFallback.textContent).toMatch(/intentional explosion/);
    // Standard fallback is NOT rendered when a custom one is supplied.
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull();
  });

  it('resets state when a resetKey changes', () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={['/a']}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();
    // Change the resetKey AND swap the child for a happy one.
    rerender(
      <ErrorBoundary resetKeys={['/b']}>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull();
    expect(screen.getByTestId('happy-path')).toBeTruthy();
  });

  it('clears the error when the user clicks "Try again"', () => {
    let throws = true;
    const Wrapped = () => {
      const [_, setN] = React.useState(0);
      return (
        <ErrorBoundary
          fallback={(_err, reset) => (
            <button
              data-testid="custom-reset"
              onClick={() => {
                throws = false;
                reset();
                setN((n) => n + 1);
              }}
            >
              Click to reset
            </button>
          )}
        >
          <Bomb shouldThrow={throws} />
        </ErrorBoundary>
      );
    };
    render(<Wrapped />);
    const btn = screen.getByTestId('custom-reset');
    fireEvent.click(btn);
    expect(screen.queryByTestId('custom-reset')).toBeNull();
    expect(screen.getByTestId('happy-path')).toBeTruthy();
  });
});
