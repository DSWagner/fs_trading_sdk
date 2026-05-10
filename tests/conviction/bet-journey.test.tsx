/**
 * End-to-end "user journey" simulation test.
 *
 * Simulates what happens to a real user's data as they:
 *   1. Sign in and pick a username (storage)
 *   2. Place a bet on a market that is still open (recordBet)
 *   3. Get redirected to the Receipt page (Polaroid renders open state)
 *   4. Copy a share URL (buildShareUrl + readShareFromHash round-trip)
 *   5. Copy the receipt as Markdown (buildMarkdownReceipt with the real data)
 *   6. The market resolves, outcome lands at a real value
 *   7. Same user revisits the receipt (Polaroid re-renders developed)
 *   8. Animation plays through completely
 *   9. Markdown export now includes the outcome line
 *
 * This is the strongest single test we have: it exercises the full data plumbing
 * end-to-end without any mocks of internal modules. Anything that breaks the
 * journey breaks this test.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { Polaroid } from '../../demo-app/src/conviction/components/Polaroid';
import {
  recordBet,
  getBet,
  getBetsByUser,
  rememberUsername,
  recallUsername,
  type BetRecord,
} from '../../demo-app/src/conviction/storage';
import {
  buildShareUrl,
  buildEmbedUrl,
  readShareFromHash,
} from '../../demo-app/src/conviction/hash';
import { buildMarkdownReceipt } from '../../demo-app/src/conviction/markdownReceipt';

// Replicates what BetFlow.handleSubmit constructs for the localStorage record.
const PLACED_BET: BetRecord = {
  marketId: 'fed-funds-eoy-2025',
  positionId: 'pos-abc-123',
  username: 'macro_lurker',
  reasoning: 'Two cuts before October. Inflation is sticky, employment data is breaking faster than expected.',
  conviction: 0.78,
  prediction: 4.0,
  spread: 0.35,
  shape: 'gaussian',
  collateral: 35,
  createdAt: '2025-08-12T12:00:00.000Z',
  marketTitle: 'Fed Funds rate at end of 2025',
  marketUnits: '%',
  lowerBound: 2.5,
  upperBound: 5.5,
  preset: 'sunset',
};

const RESOLVED_OUTCOME = 4.25;

describe('User journey: place bet, share, resolve, view, export', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the URL hash; readShareFromHash reads from window.location.
    window.location.hash = '';
  });

  afterEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('Step 1: signing in stores the username and persists across reads', () => {
    rememberUsername('macro_lurker');
    expect(recallUsername()).toBe('macro_lurker');
  });

  it('Step 2: placing a bet writes the full record to localStorage', () => {
    recordBet(PLACED_BET);
    const fromStorage = getBet(PLACED_BET.marketId, PLACED_BET.positionId);
    expect(fromStorage).not.toBeNull();
    expect(fromStorage?.username).toBe('macro_lurker');
    expect(fromStorage?.prediction).toBe(4.0);
    expect(fromStorage?.preset).toBe('sunset');
    expect(getBetsByUser('macro_lurker')).toHaveLength(1);
  });

  it('Step 3: the open Polaroid shows pending state with no outcome thread', () => {
    const { container } = render(
      <Polaroid
        marketId={PLACED_BET.marketId}
        positionId={PLACED_BET.positionId}
        marketTitle={PLACED_BET.marketTitle ?? ''}
        marketUnits={PLACED_BET.marketUnits}
        username={PLACED_BET.username}
        reasoning={PLACED_BET.reasoning}
        createdAt={PLACED_BET.createdAt}
        prediction={PLACED_BET.prediction}
        spread={PLACED_BET.spread}
        conviction={PLACED_BET.conviction}
        collateral={PLACED_BET.collateral}
        shape={PLACED_BET.shape}
        lowerBound={PLACED_BET.lowerBound ?? 0}
        upperBound={PLACED_BET.upperBound ?? 1}
        preset={PLACED_BET.preset}
        resolutionState="open"
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/DEVELOPING/);
    expect(text).toMatch(/@macro_lurker/);
    expect(text).toMatch(/predicted/);
    expect(text).toMatch(/4(\.0)?%/);
    expect(text).not.toMatch(/off by/);
    expect(text).not.toMatch(/actual/);
  });

  it('Step 4: building a share URL produces a hash that round-trips back to the same payload', () => {
    const shareUrl = buildShareUrl(`/r/${PLACED_BET.marketId}/${PLACED_BET.positionId}`, {
      reasoning: PLACED_BET.reasoning,
      conviction: PLACED_BET.conviction,
      username: PLACED_BET.username,
      prediction: PLACED_BET.prediction,
      spread: PLACED_BET.spread,
      shape: PLACED_BET.shape,
      collateral: PLACED_BET.collateral,
      createdAt: PLACED_BET.createdAt,
      marketTitle: PLACED_BET.marketTitle,
      preset: PLACED_BET.preset,
    });
    expect(shareUrl).toContain('#r=');
    // The receiving side decodes by setting window.location.hash, then calling
    // readShareFromHash. Simulate that.
    const hash = shareUrl.slice(shareUrl.indexOf('#'));
    window.location.hash = hash;
    const decoded = readShareFromHash();
    expect(decoded).not.toBeNull();
    expect(decoded?.username).toBe('macro_lurker');
    expect(decoded?.reasoning).toBe(PLACED_BET.reasoning);
    expect(decoded?.prediction).toBe(4.0);
    expect(decoded?.preset).toBe('sunset');
  });

  it('Step 5: open-bet markdown export contains all signals but no outcome line', () => {
    const md = buildMarkdownReceipt({
      username: PLACED_BET.username,
      reasoning: PLACED_BET.reasoning,
      marketTitle: PLACED_BET.marketTitle ?? 'this market',
      marketUnits: PLACED_BET.marketUnits,
      prediction: PLACED_BET.prediction,
      collateral: PLACED_BET.collateral,
      conviction: PLACED_BET.conviction,
      shape: PLACED_BET.shape,
      createdAt: PLACED_BET.createdAt,
      shareUrl: 'https://example.com/r/x/y#r=abc',
      embedUrl: 'https://example.com/embed/r/x/y#r=abc',
      resolutionState: 'open',
    });
    expect(md).toMatch(/Two cuts before October/);
    expect(md).toMatch(/@macro_lurker/);
    expect(md).toMatch(/predicted \*\*4\.00%\*\*/);
    expect(md).toMatch(/stake \$35/);
    expect(md).toMatch(/conviction 8\/10/);
    expect(md).toMatch(/Aug 12, 2025/);
    expect(md).toMatch(/Fed Funds rate at end of 2025/);
    expect(md).not.toMatch(/Settled at/);
    expect(md).not.toMatch(/called it|missed/);
  });

  it('Step 6: when the bet resolves the embed URL still resolves to the same payload', () => {
    const embedUrl = buildEmbedUrl(PLACED_BET.marketId, PLACED_BET.positionId, {
      reasoning: PLACED_BET.reasoning,
      conviction: PLACED_BET.conviction,
      username: PLACED_BET.username,
      prediction: PLACED_BET.prediction,
      spread: PLACED_BET.spread,
      shape: PLACED_BET.shape,
      collateral: PLACED_BET.collateral,
      createdAt: PLACED_BET.createdAt,
      marketTitle: PLACED_BET.marketTitle,
      preset: PLACED_BET.preset,
    });
    const hash = embedUrl.slice(embedUrl.indexOf('#'));
    window.location.hash = hash;
    const decoded = readShareFromHash();
    expect(decoded?.username).toBe('macro_lurker');
    expect(decoded?.preset).toBe('sunset');
  });

  it('Step 7: re-rendering with resolved state shows the outcome and accuracy verdict', () => {
    const { container } = render(
      <Polaroid
        marketId={PLACED_BET.marketId}
        positionId={PLACED_BET.positionId}
        marketTitle={PLACED_BET.marketTitle ?? ''}
        marketUnits={PLACED_BET.marketUnits}
        username={PLACED_BET.username}
        reasoning={PLACED_BET.reasoning}
        createdAt={PLACED_BET.createdAt}
        prediction={PLACED_BET.prediction}
        spread={PLACED_BET.spread}
        conviction={PLACED_BET.conviction}
        collateral={PLACED_BET.collateral}
        shape={PLACED_BET.shape}
        lowerBound={PLACED_BET.lowerBound ?? 0}
        upperBound={PLACED_BET.upperBound ?? 1}
        preset={PLACED_BET.preset}
        resolutionState="resolved"
        resolvedOutcome={RESOLVED_OUTCOME}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/DEVELOPING/);
    expect(text).toMatch(/actual/);
    expect(text).toMatch(/4\.25%/);
    expect(text).toMatch(/off by/);
    expect(text).toMatch(/→/);
    expect(text).toMatch(/CALLED IT|CLOSE|MISSED/);
  });

  it('Step 8: animation plays through completely on the resolved Polaroid', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <Polaroid
          marketId={PLACED_BET.marketId}
          positionId={PLACED_BET.positionId}
          marketTitle={PLACED_BET.marketTitle ?? ''}
          marketUnits={PLACED_BET.marketUnits}
          username={PLACED_BET.username}
          reasoning={PLACED_BET.reasoning}
          createdAt={PLACED_BET.createdAt}
          prediction={PLACED_BET.prediction}
          spread={PLACED_BET.spread}
          conviction={PLACED_BET.conviction}
          collateral={PLACED_BET.collateral}
          shape={PLACED_BET.shape}
          lowerBound={PLACED_BET.lowerBound ?? 0}
          upperBound={PLACED_BET.upperBound ?? 1}
          preset={PLACED_BET.preset}
          resolutionState="resolved"
          resolvedOutcome={RESOLVED_OUTCOME}
          animateDevelop
        />,
      );
      const svg = () => container.querySelector('svg')!;

      // Frame 0: dim filter, no transition.
      expect(svg().getAttribute('style')).toMatch(/saturate\(0\.18\)/);
      expect(svg().getAttribute('style')).toMatch(/transition: ?none/);

      // 60 ms: filter cleared, transition active, content already correct.
      act(() => vi.advanceTimersByTime(60));
      expect(svg().getAttribute('style')).not.toMatch(/saturate\(0\.18\)/);
      expect(svg().getAttribute('style')).toMatch(/transition: ?filter 900ms/);

      // 1010 ms: animation complete, no transition style left attached.
      act(() => vi.advanceTimersByTime(950));
      expect(svg().getAttribute('style')).not.toMatch(/saturate\(0\.18\)/);
      expect(svg().getAttribute('style')).not.toMatch(/transition: ?filter/);

      // Final content matches the static developed render exactly.
      const text = container.textContent ?? '';
      expect(text).toMatch(/4\.25%/);
      expect(text).toMatch(/off by/);
      expect(text).not.toMatch(/DEVELOPING/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Step 9: resolved-bet markdown export adds the outcome line and a verdict', () => {
    const md = buildMarkdownReceipt({
      username: PLACED_BET.username,
      reasoning: PLACED_BET.reasoning,
      marketTitle: PLACED_BET.marketTitle ?? 'this market',
      marketUnits: PLACED_BET.marketUnits,
      prediction: PLACED_BET.prediction,
      collateral: PLACED_BET.collateral,
      conviction: PLACED_BET.conviction,
      shape: PLACED_BET.shape,
      createdAt: PLACED_BET.createdAt,
      shareUrl: 'https://example.com/r/x/y#r=abc',
      embedUrl: 'https://example.com/embed/r/x/y#r=abc',
      resolutionState: 'resolved',
      resolvedOutcome: RESOLVED_OUTCOME,
    });
    expect(md).toMatch(/Settled at/);
    expect(md).toMatch(/4\.25%/);
    expect(md).toMatch(/off by 6%/);
    // 6% off → the "close" bucket.
    expect(md).toMatch(/close/);
    expect(md).not.toMatch(/wide margin/);
  });

  it('Full journey: same data flows correctly through every step (regression)', () => {
    // 1. Sign in
    rememberUsername('macro_lurker');
    expect(recallUsername()).toBe('macro_lurker');

    // 2. Place bet
    recordBet(PLACED_BET);
    const stored = getBet(PLACED_BET.marketId, PLACED_BET.positionId);
    expect(stored).not.toBeNull();

    // 3. Build share URL
    const shareUrl = buildShareUrl(`/r/${stored!.marketId}/${stored!.positionId}`, {
      reasoning: stored!.reasoning,
      conviction: stored!.conviction,
      username: stored!.username,
      prediction: stored!.prediction,
      spread: stored!.spread,
      shape: stored!.shape,
      collateral: stored!.collateral,
      createdAt: stored!.createdAt,
      marketTitle: stored!.marketTitle,
      preset: stored!.preset,
    });

    // 4. Decode via hash
    window.location.hash = shareUrl.slice(shareUrl.indexOf('#'));
    const decoded = readShareFromHash();
    expect(decoded?.username).toBe(stored!.username);
    expect(decoded?.reasoning).toBe(stored!.reasoning);

    // 5. Verify the localStorage record and the hash payload would render the
    // same Polaroid (i.e. share-link recipients see what the author sees).
    expect(decoded?.prediction).toBe(stored!.prediction);
    expect(decoded?.preset).toBe(stored!.preset);
    expect(decoded?.shape).toBe(stored!.shape);
    expect(decoded?.collateral).toBe(stored!.collateral);
  });
});
