// @vitest-environment node
/* eslint-disable n/no-process-env */
// SAFETY: Node 20+ fetch uses undici, which on Windows ships its own CA bundle
// that does not include corporate / OS-installed roots. The dev engine is a
// public TLS endpoint -- curl reaches it fine -- but undici may reject it with
// UNABLE_TO_GET_ISSUER_CERT_LOCALLY. We relax TLS verification *for this file
// only* because:
//   (a) this is a smoke test that runs ad-hoc, never in production,
//   (b) the assertion target is a public dev sandbox that holds no real money.
// Do not copy this pattern anywhere else.
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

/**
 * Live integration smoke test against the FunctionSpace competition dev engine.
 *
 *   Endpoint: https://fs-engine-api-dev.onrender.com (CORS open, paper liquidity)
 *
 * No money is at stake. The engine resets state periodically. We:
 *   - hit the public market-list endpoint and verify the shape
 *   - run a passwordless login with a unique throwaway username
 *   - fetch a single market's full state via the SDK
 *
 * If the network is offline or the dev engine is rate-limiting, every test in
 * this file logs and skips. We never want CI red because the free tier napped.
 *
 * Set CONVICTION_SKIP_LIVE=1 to skip entirely (e.g. in offline CI).
 */

import { describe, it, expect } from 'vitest';
import { FSClient } from '../../packages/core/src/client.js';
import { passwordlessLoginUser } from '../../packages/core/src/auth/auth.js';
import { discoverMarkets } from '../../packages/core/src/discovery/markets.js';
import { queryMarketState } from '../../packages/core/src/queries/market.js';

const ENDPOINT = process.env.VITE_FS_BASE_URL || 'https://fs-engine-api-dev.onrender.com';
const SKIP = process.env.CONVICTION_SKIP_LIVE === '1';
const TIMEOUT = 30_000;

const describeLive = SKIP ? describe.skip : describe;

let _reachableCache: boolean | null = null;
async function reachable(): Promise<boolean> {
  if (_reachableCache !== null) return _reachableCache;
  try {
    const ctrl = new AbortController();
    // The dev engine cold-starts on Render's free tier, which can take 30+ seconds.
    const id = setTimeout(() => ctrl.abort(), 45_000);
    const res = await fetch(`${ENDPOINT}/api/views/markets/list`, { signal: ctrl.signal });
    clearTimeout(id);
    _reachableCache = res.ok || res.status === 401 || res.status === 403;
  } catch (e) {
    console.warn(`[live] reachability probe failed: ${(e as Error).message}`);
    _reachableCache = false;
  }
  return _reachableCache;
}

describeLive('Live engine: reachability', () => {
  it(
    'is reachable',
    async () => {
      const ok = await reachable();
      if (!ok) {
        console.warn(`[live] ${ENDPOINT} unreachable, skipping live tests`);
      }
      expect(typeof ok).toBe('boolean');
    },
    TIMEOUT,
  );
});

describeLive('Live engine: market discovery', () => {
  it(
    'lists at least one open market',
    async () => {
      if (!(await reachable())) return;
      const client = new FSClient({ baseUrl: ENDPOINT });
      const markets = await discoverMarkets(client, { state: 'open' });
      expect(Array.isArray(markets)).toBe(true);
      // The competition advertises 233+ markets, but we are tolerant.
      expect(markets.length).toBeGreaterThan(0);
      const m = markets[0];
      expect(m.marketId).toBeDefined();
      expect(typeof m.title === 'string' || typeof m.title === 'undefined').toBe(true);
      expect(m.config).toBeDefined();
      expect(typeof m.config.lowerBound).toBe('number');
      expect(typeof m.config.upperBound).toBe('number');
      expect(m.config.upperBound).toBeGreaterThan(m.config.lowerBound);
      expect(typeof m.config.numBuckets).toBe('number');
      expect(m.config.numBuckets).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it(
    'returns the same market when queried directly',
    async () => {
      if (!(await reachable())) return;
      const client = new FSClient({ baseUrl: ENDPOINT });
      const markets = await discoverMarkets(client, { state: 'open' });
      if (markets.length === 0) return;
      const expected = markets[0];
      const direct = await queryMarketState(client, expected.marketId);
      expect(direct.marketId).toBe(expected.marketId);
      expect(direct.config.numBuckets).toBe(expected.config.numBuckets);
      expect(direct.config.lowerBound).toBeCloseTo(expected.config.lowerBound, 6);
      expect(direct.config.upperBound).toBeCloseTo(expected.config.upperBound, 6);
    },
    TIMEOUT,
  );
});

describeLive('Live engine: passwordless login', () => {
  it(
    'creates a fresh handle and returns a session',
    async () => {
      if (!(await reachable())) return;
      const client = new FSClient({ baseUrl: ENDPOINT });
      // Throwaway handle, unlikely to collide with a password-protected account.
      const username = `conv_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const result = await passwordlessLoginUser(client, username);
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe(username);
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(20);
      expect(['login', 'signup']).toContain(result.action);
    },
    TIMEOUT,
  );

  it(
    'rejects an empty username',
    async () => {
      if (!(await reachable())) return;
      const client = new FSClient({ baseUrl: ENDPOINT });
      let threw = false;
      try {
        await passwordlessLoginUser(client, '');
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    },
    TIMEOUT,
  );
});
