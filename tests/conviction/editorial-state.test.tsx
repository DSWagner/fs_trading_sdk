/**
 * Render tests for the EditorialLoading / EditorialEmpty / EditorialError
 * components. These are the editorial replacements for "Loading…" / "Empty"
 * placeholders, used across Discover, BetFlow, Receipt, Profile, and Embed.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import {
  EditorialLoading,
  EditorialEmpty,
  EditorialError,
} from '../../demo-app/src/conviction/components/EditorialState';

describe('EditorialLoading', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the first line on initial mount', () => {
    const { container } = render(
      <EditorialLoading lines={['Pulling consensus from the wire…', 'Reading the crowd…']} />,
    );
    expect(container.textContent).toMatch(/Pulling consensus from the wire/);
  });

  it('rotates to the next line after the interval', () => {
    const { container } = render(
      <EditorialLoading
        interval={1000}
        lines={['First line.', 'Second line.', 'Third line.']}
      />,
    );
    expect(container.textContent).toMatch(/First line/);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.textContent).toMatch(/Second line/);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.textContent).toMatch(/Third line/);
  });

  it('exposes role="status" and aria-live for screen readers', () => {
    const { container } = render(<EditorialLoading lines={['One']} />);
    const statusEl = container.querySelector('[role="status"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl?.getAttribute('aria-live')).toBe('polite');
  });

  it('renders the eyebrow when provided', () => {
    const { container } = render(
      <EditorialLoading eyebrow="Tuning the question" lines={['Working…']} />,
    );
    expect(container.textContent).toMatch(/Tuning the question/);
  });

  it('renders an inline variant without the chrome', () => {
    const { container } = render(
      <EditorialLoading inline lines={['Loading markets']} />,
    );
    expect(container.textContent).toMatch(/LOADING MARKETS/);
    // Inline variant must not render the role=status block.
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('falls back to a placeholder line when given an empty array', () => {
    const { container } = render(<EditorialLoading lines={[]} />);
    expect(container.textContent).toMatch(/One moment/);
  });
});

describe('EditorialEmpty', () => {
  it('renders a headline', () => {
    const { container } = render(
      <EditorialEmpty headline="Quiet shelf." />,
    );
    expect(container.textContent).toMatch(/Quiet shelf/);
  });

  it('renders body text when provided', () => {
    const { container } = render(
      <EditorialEmpty headline="Empty." body="Try a different filter." />,
    );
    expect(container.textContent).toMatch(/Try a different filter/);
  });

  it('omits body when not provided', () => {
    const { container } = render(<EditorialEmpty headline="Empty." />);
    // Headline should be the only paragraph-like text.
    expect(container.querySelectorAll('p').length).toBe(0);
  });

  it('renders the action link when provided', () => {
    const { container } = render(
      <EditorialEmpty headline="Empty." action={{ label: 'Browse', href: '/discover' }} />,
    );
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/discover');
    expect(link?.textContent).toMatch(/Browse/);
  });

  it('invokes onActionClick with the click event', () => {
    const onClick = vi.fn();
    const { container } = render(
      <EditorialEmpty
        headline="Empty."
        action={{ label: 'Reset', href: '#' }}
        onActionClick={onClick}
      />,
    );
    const link = container.querySelector('a')!;
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('EditorialError', () => {
  it('renders the message', () => {
    const { container } = render(<EditorialError message="Network blew up." />);
    expect(container.textContent).toMatch(/Network blew up/);
  });

  it('renders the optional hint', () => {
    const { container } = render(
      <EditorialError message="Failed." hint="Try again in a few seconds." />,
    );
    expect(container.textContent).toMatch(/Try again in a few seconds/);
  });

  it('exposes role="alert" for screen readers', () => {
    const { container } = render(<EditorialError message="Boom." />);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
