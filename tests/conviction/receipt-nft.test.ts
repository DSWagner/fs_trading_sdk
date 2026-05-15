/**
 * @vitest-environment jsdom
 *
 * Ed25519 receipt-NFT signing tests. Exercises the full
 * sign-then-verify round-trip plus the three failure modes we care
 * about: tampered fields, invalid signatures, and unsigned receipts.
 *
 * The jsdom environment is used (rather than node) because the
 * receiptNft module reads `window.localStorage` to persist the
 * keypair across renders.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalFingerprint,
  signFingerprint,
  verifySignature,
  ensureKeyPair,
  cachedPublicKeyHex,
} from '../../demo-app/src/conviction/receiptNft';

const sampleInputs = {
  marketId: 'mkt-123',
  positionId: 'pos-9',
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
});

describe('canonicalFingerprint', () => {
  it('is stable across re-ordered input keys', () => {
    const a = canonicalFingerprint(sampleInputs);
    // Object literal with same content in different order:
    const b = canonicalFingerprint({
      reasoning: 'I have a hunch.',
      conviction: 0.8,
      prediction: 0.42,
      collateral: 50,
      shape: 'gaussian',
      spread: 0.05,
      createdAt: '2026-05-14T12:00:00Z',
      username: 'tester',
      marketId: 'mkt-123',
      positionId: 'pos-9',
    });
    expect(a).toBe(b);
  });

  it('differs when any field changes', () => {
    const base = canonicalFingerprint(sampleInputs);
    expect(canonicalFingerprint({ ...sampleInputs, prediction: 0.43 })).not.toBe(base);
    expect(canonicalFingerprint({ ...sampleInputs, reasoning: 'different' })).not.toBe(base);
    expect(canonicalFingerprint({ ...sampleInputs, collateral: 51 })).not.toBe(base);
  });

  it('rounds floats to 6 decimals so cross-browser float drift doesn\'t break the signature', () => {
    const a = canonicalFingerprint({ ...sampleInputs, prediction: 0.42 });
    const b = canonicalFingerprint({ ...sampleInputs, prediction: 0.42000000001 });
    expect(a).toBe(b);
  });

  it('coerces missing fields to empty defaults rather than throwing', () => {
    const fp = canonicalFingerprint({
      marketId: 'm',
      positionId: 'p',
      username: 'u',
      prediction: Number.NaN,
      conviction: Number.NaN,
      collateral: Number.NaN,
      spread: Number.NaN,
      shape: '' as any,
      reasoning: '' as any,
      createdAt: '' as any,
    });
    expect(typeof fp).toBe('string');
    expect(fp.length).toBeGreaterThan(0);
  });
});

describe('Ed25519 sign / verify roundtrip', () => {
  it('signFingerprint then verifySignature returns "verified"', async () => {
    const fp = canonicalFingerprint(sampleInputs);
    const sig = await signFingerprint(fp);
    expect(sig).not.toBeNull();
    if (!sig) return;
    expect(sig.pubKey.length).toBe(64); // 32 bytes hex
    expect(sig.sig.length).toBe(128); // 64 bytes hex
    const verdict = await verifySignature(sig, fp);
    expect(verdict).toBe('verified');
  });

  it('detects a tampered field by returning "tampered"', async () => {
    const fp = canonicalFingerprint(sampleInputs);
    const sig = await signFingerprint(fp);
    expect(sig).not.toBeNull();
    if (!sig) return;
    const tamperedLive = canonicalFingerprint({ ...sampleInputs, prediction: 0.99 });
    const verdict = await verifySignature(sig, tamperedLive);
    expect(verdict).toBe('tampered');
  });

  it('returns "invalid" when the signature bytes are corrupted', async () => {
    const fp = canonicalFingerprint(sampleInputs);
    const sig = await signFingerprint(fp);
    if (!sig) return;
    const corrupted = { ...sig, sig: sig.sig.replace(/^./, sig.sig[0] === '0' ? '1' : '0') };
    const verdict = await verifySignature(corrupted, fp);
    expect(verdict).toBe('invalid');
  });

  it('returns "unsigned" for a null signature', async () => {
    const verdict = await verifySignature(null, canonicalFingerprint(sampleInputs));
    expect(verdict).toBe('unsigned');
  });

  it('reuses the same keypair across multiple signs (persists in localStorage)', async () => {
    const a = await signFingerprint('first');
    const b = await signFingerprint('second');
    expect(a?.pubKey).toBe(b?.pubKey);
  });

  it('ensureKeyPair populates the cached public key hex', async () => {
    expect(cachedPublicKeyHex()).toBeNull();
    await ensureKeyPair();
    const hex = cachedPublicKeyHex();
    expect(hex).not.toBeNull();
    expect(hex?.length).toBe(64);
  });

  it('returns "invalid" for malformed hex pubkey bytes', async () => {
    const fp = canonicalFingerprint(sampleInputs);
    const sig = await signFingerprint(fp);
    if (!sig) return;
    const verdict = await verifySignature({ ...sig, pubKey: 'zz' }, fp);
    expect(verdict).toBe('invalid');
  });
});
