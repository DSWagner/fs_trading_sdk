/**
 * Pure-function tests for Conviction's URL-hash codec.
 *
 * The codec is the load-bearing piece for cross-device receipt sharing:
 * if it round-trips wrong, every shared link breaks. These tests cover:
 *   - basic round-trip
 *   - empty / minimal payloads
 *   - long reasoning, unicode, emoji, control chars
 *   - URL-safe alphabet (no `+`, `/`, `=` in encoded output)
 *   - graceful failure on garbage input
 *   - readShareFromHash() in a jsdom window
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodePayload,
  decodePayload,
  buildShareHash,
  buildShareUrl,
  buildEmbedUrl,
  readShareFromHash,
  type SharedPayload,
} from '../../demo-app/src/conviction/hash';

describe('hash.ts: encode/decode round-trip', () => {
  const cases: Array<[string, SharedPayload]> = [
    ['minimal', { reasoning: 'hello' }],
    ['empty reasoning', { reasoning: '' }],
    ['full payload', {
      reasoning: 'Two cuts before October. Inflation is sticky, employment is breaking.',
      conviction: 0.78,
      username: 'macro_lurker',
      prediction: 4.0,
      spread: 0.35,
      shape: 'gaussian',
      collateral: 35,
      createdAt: '2025-08-12T00:00:00.000Z',
      marketTitle: 'Fed Funds rate at end of 2025',
      preset: 'sunset',
    }],
  ];

  for (const [name, payload] of cases) {
    it(`round-trips ${name}`, () => {
      const encoded = encodePayload(payload);
      const decoded = decodePayload(encoded);
      expect(decoded).toEqual(payload);
    });
  }

  it('round-trips long reasoning (4 KB)', () => {
    const big = 'A'.repeat(4000);
    const payload: SharedPayload = { reasoning: big, username: 'verbose' };
    expect(decodePayload(encodePayload(payload))).toEqual(payload);
  });

  it('preserves unicode and emoji', () => {
    const payload: SharedPayload = {
      reasoning: 'Açaí, café, naïve résumé. The sun sets at 17:32 ⚡ and the curve is sharp 📈',
      username: 'café_owner_42',
      marketTitle: 'Will the café reopen by year-end? 🤔',
    };
    expect(decodePayload(encodePayload(payload))).toEqual(payload);
  });

  it('preserves CJK characters', () => {
    const payload: SharedPayload = {
      reasoning: '春が来た。市場は震えている。',
      username: '東京来訪者',
    };
    expect(decodePayload(encodePayload(payload))).toEqual(payload);
  });

  it('preserves quotes, backslashes, newlines', () => {
    const payload: SharedPayload = {
      reasoning: 'They said \"this is the year\" but it never is.\nNew line.\\Backslash.',
    };
    expect(decodePayload(encodePayload(payload))).toEqual(payload);
  });

  it('preserves a payload that contains the equals sign', () => {
    const payload: SharedPayload = { reasoning: 'a=b=c=d' };
    expect(decodePayload(encodePayload(payload))).toEqual(payload);
  });
});

describe('hash.ts: encoded form properties', () => {
  it('uses the URL-safe alphabet (no +, /, =)', () => {
    const encoded = encodePayload({
      reasoning: 'standard reasoning that probably forces some + and / chars',
      username: 'someone',
    });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('produces stable output for the same input', () => {
    const a = encodePayload({ reasoning: 'same', username: 'me' });
    const b = encodePayload({ reasoning: 'same', username: 'me' });
    expect(a).toBe(b);
  });
});

describe('hash.ts: graceful failure', () => {
  it('decodePayload returns null for empty string', () => {
    expect(decodePayload('')).toBeNull();
  });

  it('decodePayload returns null for non-base64 input', () => {
    expect(decodePayload('!!!not base64!!!')).toBeNull();
  });

  it('decodePayload returns null for valid base64 that is not JSON', () => {
    // base64('hello world') = aGVsbG8gd29ybGQ
    expect(decodePayload('aGVsbG8gd29ybGQ')).toBeNull();
  });

  it('decodePayload tolerates missing padding', () => {
    const enc = encodePayload({ reasoning: 'no padding here' });
    expect(decodePayload(enc.replace(/=+$/, ''))).toEqual({ reasoning: 'no padding here' });
  });
});

describe('hash.ts: URL builders', () => {
  it('buildShareHash starts with #r= and is decodeable back to the payload', () => {
    const payload: SharedPayload = { reasoning: 'tested', username: 'user' };
    const hash = buildShareHash(payload);
    expect(hash.startsWith('#r=')).toBe(true);
    const params = new URLSearchParams(hash.slice(1));
    const encoded = params.get('r');
    expect(encoded).toBeTruthy();
    expect(decodePayload(encoded!)).toEqual(payload);
  });

  it('buildShareUrl produces an absolute URL when window is available', () => {
    const payload: SharedPayload = { reasoning: 'a' };
    const url = buildShareUrl('/r/123/456', payload);
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toContain('/r/123/456');
    expect(url).toContain('#r=');
  });

  it('buildEmbedUrl produces an embed path with the same hash', () => {
    const payload: SharedPayload = { reasoning: 'em', username: 'user' };
    const url = buildEmbedUrl('mid', 'pid', payload);
    expect(url).toContain('/embed/r/mid/pid');
    expect(url).toContain('#r=');
  });

  it('buildEmbedUrl percent-encodes path components with special chars', () => {
    const url = buildEmbedUrl('mar/ket', 'pos id', { reasoning: 'x' });
    expect(url).toContain('/embed/r/mar%2Fket/pos%20id');
  });
});

describe('hash.ts: readShareFromHash', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  });

  it('returns null when there is no hash', () => {
    expect(readShareFromHash()).toBeNull();
  });

  it('returns null when the hash has no r= parameter', () => {
    window.location.hash = '#foo=bar';
    expect(readShareFromHash()).toBeNull();
  });

  it('hydrates a payload from the current window hash', () => {
    const payload: SharedPayload = {
      reasoning: 'roundtrip',
      conviction: 0.5,
      preset: 'aurora',
    };
    window.location.hash = buildShareHash(payload);
    expect(readShareFromHash()).toEqual(payload);
  });
});
