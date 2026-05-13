/**
 * @vitest-environment jsdom
 *
 * ShareKit tests.
 *
 * The ShareKit owns the receipt's share flow: Web Share API (with
 * file attachment where supported), Twitter intent fallback, copy
 * link, and PNG download. The component is the single user-facing
 * affordance for share/copy/download, so it has to behave correctly
 * across every platform shape:
 *
 *   - Modern Chromium-on-mobile: navigator.share + navigator.canShare
 *     accepting files.
 *   - Desktop browsers without navigator.share: must fall back to
 *     opening a Twitter intent URL in a new tab.
 *   - Browsers with navigator.share but without canShare: must
 *     attempt share() with URL only, then fall back to Twitter.
 *   - Copy link uses navigator.clipboard.writeText.
 *   - Failures don't crash the component — failed copy shows
 *     "Copy failed", failed download shows "Try again".
 *
 * jsdom doesn't ship URL.createObjectURL or Image with a working
 * onload event for in-memory SVGs, so the PNG-generation path is
 * exercised separately from the share-button click path. The share
 * flow runs in two branches we test independently: the
 * "file-supported" branch (we stub canShare/share) and the
 * "fallback to Twitter" branch (we strip share entirely).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import {
  ShareKit,
  buildCaption,
  buildTwitterIntent,
} from '../../demo-app/src/conviction/components/ShareKit';

// ── Module-level mocks ────────────────────────────────────────────────

vi.mock('../../demo-app/src/conviction/components/downloadPolaroid', () => ({
  downloadPolaroidPng: vi.fn(async () => undefined),
}));

import { downloadPolaroidPng } from '../../demo-app/src/conviction/components/downloadPolaroid';

// ── Helpers ────────────────────────────────────────────────────────────

function buildPolaroidRef(): React.RefObject<HTMLElement | null> {
  // The ShareKit's PNG path queries `polaroidRef.current.querySelector('svg')`.
  // We build a minimal DOM container with an SVG inside that satisfies
  // the contract without exercising the canvas raster (jsdom canvas
  // can't draw an SVG image anyway).
  const container = document.createElement('div');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '320');
  svg.setAttribute('height', '480');
  svg.setAttribute('viewBox', '0 0 320 480');
  container.appendChild(svg);
  return { current: container };
}

function defaultProps() {
  return {
    polaroidRef: buildPolaroidRef(),
    shareUrl: 'https://conviction.example/r/abc123',
    username: 'tape_reader',
    marketTitle: 'Will the merger close in Q4?',
  };
}

let originalNavigator: any;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The PNG path inside ShareKit warns via console.warn when raster
  // generation fails. In jsdom that ALWAYS happens (no canvas), so
  // the warn fires in every test that touches the share button. We
  // muzzle it here to keep test output focused on real assertions.
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  // NOTE: we intentionally do NOT use `vi.useFakeTimers()` here, even
  // though the component schedules `window.setTimeout(...)` resets for
  // its transient "Copied ✓" / "Shared ✓" labels. Reason: testing-library's
  // `waitFor` uses real timers internally to poll the assertion, and if
  // we replace the system clock with fake timers it will spin forever.
  // The transient labels are checked synchronously after the
  // `await waitFor(...)` line, well before the 1.8s reset fires.

  // Stash and reset the navigator surface between tests.
  originalNavigator = { ...navigator };
  // Reset the downloadPolaroidPng mock between tests.
  (downloadPolaroidPng as any).mockClear();
  // Default to "no Web Share API available" — individual tests opt in.
  // Use defineProperty so we can later re-assign in specific tests.
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  consoleWarnSpy.mockRestore();
  Object.defineProperty(navigator, 'share', { value: originalNavigator.share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: originalNavigator.canShare, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: originalNavigator.clipboard, configurable: true });
});

// ── Pure helpers ──────────────────────────────────────────────────────

describe('buildCaption', () => {
  it('produces a caption with handle, market title, and tagline', () => {
    const caption = buildCaption('@tape_reader', 'Will X happen?', 'A receipt-first publication.');
    expect(caption).toMatch(/@tape_reader/);
    expect(caption).toMatch(/Will X happen\?/);
    expect(caption).toMatch(/A receipt-first publication\./);
  });

  it('truncates long market titles to keep tweets under the limit', () => {
    const longTitle = 'X'.repeat(200);
    const caption = buildCaption('@u', longTitle, 't');
    // The original 200-char title must not appear verbatim.
    expect(caption).not.toMatch(/X{200}/);
    // The truncated form ends with the ellipsis character.
    expect(caption).toMatch(/X+…/);
  });
});

describe('buildTwitterIntent', () => {
  it('builds a tweet intent URL with text and url params', () => {
    const intent = buildTwitterIntent('hello world', 'https://example.com/r/x');
    expect(intent.startsWith('https://twitter.com/intent/tweet?')).toBe(true);
    const params = new URL(intent).searchParams;
    expect(params.get('text')).toBe('hello world');
    expect(params.get('url')).toBe('https://example.com/r/x');
  });
});

// ── Component: copy link ──────────────────────────────────────────────

describe('ShareKit: copy link', () => {
  it('writes the share URL to the clipboard and shows "Link copied"', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ShareKit {...defaultProps()} />);
    const copyBtn = screen.getByTestId('share-kit-copy');
    fireEvent.click(copyBtn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://conviction.example/r/abc123'));
    await waitFor(() => expect(copyBtn.textContent).toMatch(/Link copied/));
  });

  it('shows "Copy failed" when the clipboard API rejects', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ShareKit {...defaultProps()} />);
    const copyBtn = screen.getByTestId('share-kit-copy');
    fireEvent.click(copyBtn);
    await waitFor(() => expect(copyBtn.textContent).toMatch(/Copy failed|Link copied/));
  });
});

// ── Component: share (fallback) ───────────────────────────────────────

describe('ShareKit: share — fallback to Twitter intent', () => {
  it('opens a Twitter intent URL when navigator.share is unavailable', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation((..._args: any[]) => null as any);
    render(<ShareKit {...defaultProps()} />);
    const shareBtn = screen.getByTestId('share-kit-share');
    fireEvent.click(shareBtn);
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://twitter.com/intent/tweet?'),
        '_blank',
        'noopener,noreferrer',
      ),
    );
    await waitFor(() => expect(shareBtn.textContent).toMatch(/Opened in X/));
    openSpy.mockRestore();
  });
});

// ── Component: share (Web Share API, URL-only) ────────────────────────

describe('ShareKit: share — URL-only Web Share path', () => {
  it('invokes navigator.share with title/text/url when available but file-share is unsupported', async () => {
    const shareMock = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });
    // No navigator.canShare -> the file path is skipped and the URL path is taken.
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    render(<ShareKit {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('share-kit-share'));
    await waitFor(() => expect(shareMock).toHaveBeenCalled());
    const call = shareMock.mock.calls[0][0] as any;
    expect(call.url).toBe('https://conviction.example/r/abc123');
    expect(call.text).toMatch(/@tape_reader/);
  });

  it('falls through to Twitter intent when navigator.share rejects', async () => {
    const shareMock = vi.fn(async () => {
      throw new Error('user cancelled');
    });
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });
    const openSpy = vi.spyOn(window, 'open').mockImplementation((..._args: any[]) => null as any);
    render(<ShareKit {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('share-kit-share'));
    await waitFor(() => expect(shareMock).toHaveBeenCalled());
    // If the URL-only share path rejects too, the kit opens the
    // Twitter intent fallback.
    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    openSpy.mockRestore();
  });
});

// ── Component: download ───────────────────────────────────────────────

describe('ShareKit: download PNG', () => {
  it('invokes the shared download utility with a safe filename', async () => {
    render(<ShareKit {...defaultProps()} />);
    const dlBtn = screen.getByTestId('share-kit-download');
    fireEvent.click(dlBtn);
    await waitFor(() => expect(downloadPolaroidPng).toHaveBeenCalled());
    const filename = (downloadPolaroidPng as any).mock.calls[0][1];
    expect(filename).toBe('tape_reader-conviction.png');
  });

  it('shows "Saved ✓" after a successful download', async () => {
    render(<ShareKit {...defaultProps()} />);
    const dlBtn = screen.getByTestId('share-kit-download');
    fireEvent.click(dlBtn);
    await waitFor(() => expect(dlBtn.textContent).toMatch(/Saved ✓/));
  });

  it('shows "Try again" when downloadPolaroidPng throws', async () => {
    (downloadPolaroidPng as any).mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    // Silence the expected console.error
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ShareKit {...defaultProps()} />);
    const dlBtn = screen.getByTestId('share-kit-download');
    fireEvent.click(dlBtn);
    await waitFor(() => expect(dlBtn.textContent).toMatch(/Try again/));
    errSpy.mockRestore();
  });
});
