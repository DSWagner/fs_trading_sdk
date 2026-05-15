/**
 * @vitest-environment jsdom
 *
 * UI render tests for VerifiedReceiptBadge.
 *
 * The badge owns one async lifecycle: on mount it computes the live
 * fingerprint, calls `verifySignature`, awaits the verdict, then
 * renders one of five states (verified / tampered / invalid /
 * unsigned / unsupported). These tests pin the three states that
 * matter most for end users — verified, tampered, and unsigned.
 *
 * We use the REAL Ed25519 functions (node 22 supports them natively)
 * to drive the verified + tampered paths. Unsigned is exercised by
 * passing `signature={null}`.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

import { VerifiedReceiptBadge } from '../../demo-app/src/conviction/components/VerifiedReceiptBadge';
import {
  canonicalFingerprint,
  signFingerprint,
} from '../../demo-app/src/conviction/receiptNft';

const sampleInputs = {
  marketId: 'mkt-x',
  positionId: 'pos-y',
  username: 'tester',
  prediction: 0.42,
  conviction: 0.8,
  collateral: 50,
  spread: 0.05,
  shape: 'gaussian',
  reasoning: 'I have a hunch.',
  createdAt: '2026-05-14T12:00:00Z',
};

beforeEach(() => {
  window.localStorage.clear();
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe('VerifiedReceiptBadge', () => {
  it('renders the "verified" pill when the signature matches the live fields', async () => {
    const fp = canonicalFingerprint(sampleInputs);
    const sig = await signFingerprint(fp);
    expect(sig).not.toBeNull();
    const { container } = render(
      <VerifiedReceiptBadge signature={sig!} inputs={sampleInputs} />,
    );
    await waitFor(() => {
      const badge = container.querySelector('[data-testid="receipt-verify-badge"]');
      expect(badge).not.toBeNull();
      expect(badge?.getAttribute('data-verify-verdict')).toBe('verified');
    });
  });

  it('renders the "tampered" pill when any field has changed since signing', async () => {
    const fp = canonicalFingerprint(sampleInputs);
    const sig = await signFingerprint(fp);
    expect(sig).not.toBeNull();
    const { container } = render(
      <VerifiedReceiptBadge
        signature={sig!}
        inputs={{ ...sampleInputs, prediction: 0.99 }}
      />,
    );
    await waitFor(() => {
      const badge = container.querySelector('[data-testid="receipt-verify-badge"]');
      expect(badge?.getAttribute('data-verify-verdict')).toBe('tampered');
    });
  });

  it('renders the "unsigned" pill for a null signature', async () => {
    const { container } = render(
      <VerifiedReceiptBadge signature={null} inputs={sampleInputs} />,
    );
    await waitFor(() => {
      const badge = container.querySelector('[data-testid="receipt-verify-badge"]');
      expect(badge?.getAttribute('data-verify-verdict')).toBe('unsigned');
    });
  });

  it('shows the first 8 hex chars of the pubkey on the verified badge', async () => {
    const fp = canonicalFingerprint(sampleInputs);
    const sig = await signFingerprint(fp);
    if (!sig) return;
    const { container } = render(
      <VerifiedReceiptBadge signature={sig} inputs={sampleInputs} />,
    );
    await waitFor(() => {
      const badge = container.querySelector('[data-testid="receipt-verify-badge"]');
      const txt = badge?.textContent ?? '';
      expect(txt).toContain(sig.pubKey.slice(0, 8));
    });
  });
});
