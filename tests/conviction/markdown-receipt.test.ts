/**
 * Pure-function tests for the Markdown receipt builder.
 *
 * The output is meant to paste-render in Substack, GitHub, Notion, Discord,
 * Slack, and most blog editors. We assert structural shape (blockquote, link,
 * meta line) rather than exact wording so editorial copy can evolve without
 * breaking the test.
 */

import { describe, it, expect } from 'vitest';
import { buildMarkdownReceipt, type MarkdownReceiptInput } from '../../demo-app/src/conviction/markdownReceipt';

const baseline: MarkdownReceiptInput = {
  username: 'macro_lurker',
  reasoning: 'Two cuts before October. Inflation is sticky, employment data is breaking faster than expected.',
  marketTitle: 'Fed Funds rate at end of 2025',
  marketUnits: '%',
  prediction: 4,
  collateral: 35,
  conviction: 0.78,
  shape: 'gaussian',
  createdAt: '2025-08-12T12:00:00.000Z',
  shareUrl: 'https://example.com/r/abc/123',
  embedUrl: 'https://example.com/embed/r/abc/123',
};

describe('buildMarkdownReceipt: rarity line', () => {
  it('omits the rarity line for unresolved bets', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(md).not.toMatch(/_Rarity_/);
  });

  it('omits the rarity line when consensusAtBet is missing', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      resolutionState: 'resolved',
      resolvedOutcome: 4,
      lowerBound: 0,
      upperBound: 10,
    });
    expect(md).not.toMatch(/_Rarity_/);
  });

  it('omits the rarity line when the tier is common', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      resolutionState: 'resolved',
      resolvedOutcome: 4,
      consensusAtBet: 4,
      lowerBound: 0,
      upperBound: 10,
    });
    expect(md).not.toMatch(/_Rarity_/);
  });

  it('includes the rarity line when the bet earned a tier', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      prediction: 8,
      resolutionState: 'resolved',
      resolvedOutcome: 8,
      consensusAtBet: 3,
      lowerBound: 0,
      upperBound: 10,
    });
    expect(md).toMatch(/_Rarity_/);
    expect(md.toLowerCase()).toMatch(/mythic|legendary|epic|rare|uncommon/);
  });
});

describe('buildMarkdownReceipt: structural shape', () => {
  it('produces a string', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(50);
  });

  it('starts with a blockquote of the reasoning in italics', () => {
    const md = buildMarkdownReceipt(baseline);
    const firstLine = md.split('\n')[0];
    expect(firstLine.startsWith('> *"')).toBe(true);
    expect(firstLine.endsWith('"*')).toBe(true);
  });

  it('includes the username with @ prefix', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(md).toMatch(/@macro_lurker/);
  });

  it('includes the prediction value with units', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(md).toMatch(/predicted \*\*4\.00%\*\*/);
  });

  it('includes the stake amount as $XX', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(md).toMatch(/\$35/);
  });

  it('includes a 0–10 conviction score', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(md).toMatch(/conviction 8\/10/);
  });

  it('includes the shape', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(md).toMatch(/gaussian/);
  });

  it('includes a human-readable signed date', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(md).toMatch(/Aug 12, 2025/);
  });

  it('includes a link to the share URL with the market title as link text', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(md).toMatch(/\[Fed Funds rate at end of 2025\]\(https:\/\/example\.com\/r\/abc\/123\)/);
  });

  it('includes the embed URL when provided', () => {
    const md = buildMarkdownReceipt(baseline);
    expect(md).toMatch(/\[Embed this Conviction receipt\]\(https:\/\/example\.com\/embed\/r\/abc\/123\)/);
  });

  it('omits the embed line when embedUrl is undefined', () => {
    const md = buildMarkdownReceipt({ ...baseline, embedUrl: undefined });
    expect(md).not.toMatch(/Embed this Conviction receipt/);
  });
});

describe('buildMarkdownReceipt: resolved state', () => {
  it('adds an outcome line when resolved with a finite outcome', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      resolutionState: 'resolved',
      resolvedOutcome: 4.25,
    });
    expect(md).toMatch(/Settled at/);
    expect(md).toMatch(/4\.25%/);
    expect(md).toMatch(/off by/);
  });

  it('says "called it" when prediction matches outcome within 5%', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      prediction: 4,
      resolutionState: 'resolved',
      resolvedOutcome: 4.05,
    });
    expect(md).toMatch(/called it/);
  });

  it('says "missed by a wide margin" when off by more than 25%', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      prediction: 4,
      resolutionState: 'resolved',
      resolvedOutcome: 7,
    });
    expect(md).toMatch(/missed by a wide margin/);
  });

  it('omits outcome line when resolvedOutcome is null', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      resolutionState: 'resolved',
      resolvedOutcome: null,
    });
    expect(md).not.toMatch(/Settled at/);
  });

  it('omits outcome line when resolutionState is not resolved', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      resolutionState: 'open',
      resolvedOutcome: 4.25,
    });
    expect(md).not.toMatch(/Settled at/);
  });
});

describe('buildMarkdownReceipt: edge cases', () => {
  it('handles empty reasoning gracefully', () => {
    const md = buildMarkdownReceipt({ ...baseline, reasoning: '' });
    expect(md).toMatch(/No reasoning provided/);
  });

  it('collapses newlines in reasoning to spaces (single blockquote line)', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      reasoning: 'Line one.\nLine two.\n\nLine three.',
    });
    const firstLine = md.split('\n')[0];
    expect(firstLine).toMatch(/Line one\. Line two\. Line three\./);
    // Reasoning never spills past the first line (would break the blockquote).
    expect(firstLine.endsWith('"*')).toBe(true);
  });

  it('handles missing units gracefully (no "X 4" with stray space)', () => {
    const md = buildMarkdownReceipt({ ...baseline, marketUnits: undefined });
    expect(md).toMatch(/predicted \*\*4\.00\*\*/);
    expect(md).not.toMatch(/predicted \*\*4 \*\*/);
  });

  it('escapes [ and ] in market titles to keep the link valid', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      marketTitle: 'Will [REDACTED] launch by Q4?',
    });
    // Brackets are converted to parens so the markdown link parser does not
    // mistake them for inline link syntax.
    expect(md).toMatch(/Will \(REDACTED\) launch by Q4\?/);
  });

  it('clamps conviction to 0–10 when given out-of-range input', () => {
    expect(buildMarkdownReceipt({ ...baseline, conviction: -0.5 })).toMatch(/conviction 0\/10/);
    expect(buildMarkdownReceipt({ ...baseline, conviction: 1.7 })).toMatch(/conviction 10\/10/);
  });

  it('formats large prediction values with comma thousands', () => {
    const md = buildMarkdownReceipt({
      ...baseline,
      prediction: 12_500,
      marketUnits: undefined,
    });
    expect(md).toMatch(/12,500/);
  });

  it('keeps the output deterministic (same input = same output)', () => {
    const a = buildMarkdownReceipt(baseline);
    const b = buildMarkdownReceipt(baseline);
    expect(a).toBe(b);
  });

  it('falls back to ISO when createdAt is unparseable', () => {
    const md = buildMarkdownReceipt({ ...baseline, createdAt: 'not-a-date' });
    expect(md).toMatch(/signed not-a-date/);
  });
});
