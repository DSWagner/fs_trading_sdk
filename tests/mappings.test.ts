/**
 * Mapping contract tests -- mocked-fetch unit tests for all mapping functions.
 *
 * These tests document the exact raw API response shapes and verify that each
 * mapping function correctly transforms snake_case API data into camelCase SDK
 * types. They run offline (no backend required) and serve as the baseline for
 * safe endpoint migration.
 *
 * Note: passwordlessLoginUser and silentReAuth already have mocked-fetch tests
 * in api-integration.test.ts (lines 461-616). They are not duplicated here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FSClient } from '../packages/core/src/client.js';
import { queryMarketState } from '../packages/core/src/queries/market.js';
import { queryMarketPositions } from '../packages/core/src/queries/positions.js';
import { queryMarketHistory } from '../packages/core/src/queries/history.js';
import { buy } from '../packages/core/src/transactions/buy.js';
import { sell } from '../packages/core/src/transactions/sell.js';
import { previewSell } from '../packages/core/src/previews/previewSell.js';
import { previewPayoutCurve } from '../packages/core/src/previews/previewPayoutCurve.js';
import { loginUser, signupUser, fetchCurrentUser } from '../packages/core/src/auth/auth.js';
import { discoverMarkets } from '../packages/core/src/discovery/markets.js';

// -- Shared utilities --

function makeMockClient() {
  return new FSClient({ baseUrl: 'http://localhost:8000' });
}

function makeMockClientWithAuth() {
  const client = makeMockClient();
  client.setToken('mock-token');
  return client;
}

// -- Raw API fixtures --

const mockMarketStateRaw = {
  market_id: 1,
  title: 'Test Market',
  num_buckets: 6,
  market_model: 'dirichlet',
  market_model_params: {
    P0: 100,
    mu: 0.01,
    eps_alpha: 0.001,
    tau: 1.0,
    gamma: 0.5,
    lambda_s: 0.1,
    lambda_d: 0.05,
  },
  alpha_vector: [5, 10, 20, 30, 20, 10, 5, 2],
  is_settled: false,
  settlement_outcome: null,
  settlement_payouts: null,
  num_positions: 12,
  positions_currently_open: 5,
  current_pool: 500.0,
  total_deposited: 1000.0,
  total_withdrawn: 200.0,
  total_volume: 1500.0,
  lower_bound: 0,
  upper_bound: 100,
  expires_at: null,
  resolved_at: null,
  market_type: 'standard',
  market_subtype: null,
  metadata: {
    title: 'Test Market',
    x_axis_units: 'USD',
    decimals: 2,
    market_type: 'standard',
    market_model: 'dirichlet',
    market_subtype: null,
    lower_bound: 0,
    upper_bound: 100,
    expires_at: null,
    resolved_at: null,
  },
};

const expectedMarketState = {
  alpha: [5, 10, 20, 30, 20, 10, 5, 2],
  consensus: [5/102, 10/102, 20/102, 30/102, 20/102, 10/102, 5/102, 2/102],
  totalMass: 102,
  poolBalance: 500.0,
  participantCount: 12,
  totalVolume: 1200.0,
  positionsOpen: 5,
  config: {
    numBuckets: 6,
    lowerBound: 0,
    upperBound: 100,
    K: 6,
    L: 0,
    H: 100,
    P0: 100,
    mu: 0.01,
    epsAlpha: 0.001,
    tau: 1.0,
    gamma: 0.5,
    lambdaS: 0.1,
    lambdaD: 0.05,
  },
  title: 'Test Market',
  xAxisUnits: 'USD',
  decimals: 2,
  resolutionState: 'open',
  resolvedOutcome: null,
  marketId: 1,
  createdAt: null,
  expiresAt: null,
  resolvedAt: null,
  marketType: 'standard',
  marketSubtype: null,
  metadata: mockMarketStateRaw.metadata,
  consensusMean: 43.977591036414566,
};

const mockPositionsRaw = {
  positions: [
    {
      position_id: 'pos_001',
      position_vector: [0.5, 1.0, 1.5, 1.5, 1.5, 1.0, 0.5, 0.5],
      minted_claims: 95.5,
      collateral: 100.0,
      status: 'open',
      sold_price: null,
      position_type: 'normal',
      position_params: { mean: 0.45, std_dev: 0.035 },
      username: 'trader1',
      created_at: '2026-01-15T10:30:00Z',
      position_closed_at: null,
      settlement_payout: null,
    },
    {
      position_id: 'pos_002',
      position_vector: [0.05, 0.1, 0.1, 0.3, 0.25, 0.2, 0.5, 0.5],
      minted_claims: 48.2,
      collateral: 50.0,
      status: 'closed',
      sold_price: 55.0,
      position_type: 'raw',
      position_params: {},
      username: 'trader2',
      created_at: '2026-01-16T14:00:00Z',
      position_closed_at: '2026-02-01T09:00:00Z',
      settlement_payout: null,
    },
  ],
};

const expectedPositions = [
  {
    positionId: 'pos_001',
    belief: [0.5, 1.0, 1.5, 1.5, 1.5, 1.0, 0.5, 0.5],
    collateral: 100.0,
    claims: 95.5,
    owner: 'trader1',
    status: 'open',
    prediction: null,
    stdDev: 0.035,
    positionType: 'normal',
    positionParams: { mean: 0.45, std_dev: 0.035 },
    createdAt: '2026-01-15T10:30:00Z',
    closedAt: null,
    soldPrice: null,
    settlementPayout: null,
  },
  {
    positionId: 'pos_002',
    belief: [0.05, 0.1, 0.1, 0.3, 0.25, 0.2, 0.5, 0.5],
    collateral: 50.0,
    claims: 48.2,
    owner: 'trader2',
    status: 'closed',
    prediction: null,
    stdDev: null,
    positionType: 'raw',
    positionParams: {},
    createdAt: '2026-01-16T14:00:00Z',
    closedAt: '2026-02-01T09:00:00Z',
    soldPrice: 55.0,
    settlementPayout: null,
  },
];

const mockHistoryRaw = {
  market_id: '123',
  total_snapshots: 2,
  snapshots: [
    {
      snapshot_id: 1,
      trade_id: 101,
      side: 'buy',
      position_id: 'pos_42',
      alpha_vector: [5, 10, 20, 30, 20, 10, 5, 2],
      total_deposited: 1000.0,
      total_withdrawn: 200.0,
      total_volume: 1200.0,
      current_pool: 800.0,
      num_open_positions: 5,
      created_at: '2026-01-15T10:30:00Z',
    },
    {
      snapshot_id: 2,
      trade_id: 102,
      side: 'sell',
      position_id: 'pos_43',
      alpha_vector: [6, 9, 14, 11, 5, 5, 3, 1],
      total_deposited: 1000.0,
      total_withdrawn: 250.0,
      total_volume: 1250.0,
      current_pool: 750.0,
      num_open_positions: 4,
      created_at: '2026-01-16T14:00:00Z',
    },
  ],
};

const expectedHistory = {
  marketId: '123',
  totalSnapshots: 2,
  snapshots: [
    {
      snapshotId: 1,
      tradeId: 101,
      side: 'buy',
      positionId: 'pos_42',
      alphaVector: [5, 10, 20, 30, 20, 10, 5, 2],
      totalDeposits: 1000.0,
      totalWithdrawals: 200.0,
      totalVolume: 1200.0,
      currentPool: 800.0,
      numOpenPositions: 5,
      createdAt: '2026-01-15T10:30:00Z',
    },
    {
      snapshotId: 2,
      tradeId: 102,
      side: 'sell',
      positionId: 'pos_43',
      alphaVector: [6, 9, 14, 11, 5, 5, 3, 1],
      totalDeposits: 1000.0,
      totalWithdrawals: 250.0,
      totalVolume: 1250.0,
      currentPool: 750.0,
      numOpenPositions: 4,
      createdAt: '2026-01-16T14:00:00Z',
    },
  ],
};

const mockBuyResponseRaw = {
  success: true,
  message: 'Position created successfully',
  position: {
    position_id: 99,
    position_vector: [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5],
    minted_claims: 9.5,
    collateral: 10,
    position_type: 'raw',
    position_params: { position_vector: [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5] },
  },
};

const expectedBuyResult = {
  positionId: 99,
  belief: [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5],
  claims: 9.5,
  collateral: 10,
  positionType: 'raw',
  positionParams: { position_vector: [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5] },
};

const mockSellResponseRaw = {
  success: true,
  message: 'Position sold successfully',
  position_id: 42,
  payout: 95.5,
  credited_to: 'testuser',
};

const expectedSellResult = {
  positionId: 42,
  collateralReturned: 95.5,
  creditedTo: 'testuser',
};

const mockPreviewSellRaw = {
  position_id: 42,
  payout: 88.3,
};

const expectedPreviewSellResult = {
  collateralReturned: 88.3,
  positionId: 42,
};

const mockPayoutCurveRaw = {
  projections: [
    { outcome: 0, payout: 5.0, profit_loss: -5.0 },
    { outcome: 50, payout: 15.0, profit_loss: 5.0 },
    { outcome: 100, payout: 8.0, profit_loss: -2.0 },
  ],
  max_payout: 15.0,
  max_payout_outcome: 50,
  collateral: 10,
};

const expectedPayoutCurve = {
  previews: [
    { outcome: 0, payout: 5.0, profitLoss: -5.0 },
    { outcome: 50, payout: 15.0, profitLoss: 5.0 },
    { outcome: 100, payout: 8.0, profitLoss: -2.0 },
  ],
  maxPayout: 15.0,
  maxPayoutOutcome: 50,
  inputCollateral: 10,
};

const mockLoginResponseRaw = {
  success: true,
  access_token: 'jwt-token-123',
  user: {
    user_id: 1,
    username: 'testuser',
    wallet_value: 1000.0,
    role: 'trader',
  },
};

const mockSignupResponseRaw = {
  user: {
    user_id: 2,
    username: 'newuser',
    wallet_value: 0,
    role: 'trader',
  },
};

const mockCurrentUserNested = {
  user: {
    user_id: 1,
    username: 'testuser',
    wallet_value: 1000.0,
    role: 'admin',
  },
};

const mockCurrentUserFlat = {
  user_id: 1,
  username: 'testuser',
  wallet_value: 1000.0,
  role: 'admin',
};

const expectedCurrentUser = {
  userId: 1,
  username: 'testuser',
  walletValue: 1000.0,
  role: 'admin',
};

const mockDiscoverMarketsRaw = {
  markets: [
    {
      market_id: 1,
      title: 'Market A',
      is_settled: false,
      created_at: '2026-03-13T13:48:25.106364',
      num_buckets: 6,
      total_deposited: 1000.0,
      total_withdrawn: 500.0,
      total_volume: 1500,
      current_pool: 500.0,
      deleted: false,
      deleted_at: null,
      alpha_vector: [5, 10, 20, 30, 20, 10, 5, 2],
      market_model_params: {
        P0: 100, mu: 0.01, eps_alpha: 0.001, tau: 1.0,
        gamma: 0.5, lambda_s: 0.1, lambda_d: 0.05,
      },
      metadata: {
        decimals: 2,
        market_type: 'standard',
        market_model: 'dirichlet',
        x_axis_units: 'USD',
        market_subtype: null,
      },
      market_type: 'standard',
      market_subtype: null,
      lower_bound: 0,
      upper_bound: 100,
      expires_at: null,
      resolved_at: null,
      open_positions: 5,
      total_positions: 12,
      current_consensus: 0.45,
      settlement_outcome: null,
    },
    {
      market_id: 2,
      title: 'Market B',
      is_settled: true,
      created_at: '2026-03-13T13:48:25.106364',
      num_buckets: 2,
      total_deposited: 150.0,
      total_withdrawn: 50.0,
      total_volume: 200,
      current_pool: 100.0,
      deleted: false,
      deleted_at: null,
      alpha_vector: [3, 5, 5, 3],
      market_model_params: {
        P0: 50, mu: 0.01, eps_alpha: 0.001, tau: 1.0,
        gamma: 0.5, lambda_s: 0.1, lambda_d: 0.05,
      },
      metadata: {
        decimals: 0,
        market_type: 'standard',
        market_model: 'dirichlet',
        x_axis_units: '',
        market_subtype: null,
      },
      market_type: 'standard',
      market_subtype: null,
      lower_bound: 0,
      upper_bound: 1,
      expires_at: null,
      resolved_at: null,
      open_positions: 1,
      total_positions: 3,
      current_consensus: 0.5,
      settlement_outcome: 0,
    },
  ],
};

const expectedDiscoverMarkets = [
  {
    alpha: [5, 10, 20, 30, 20, 10, 5, 2],
    consensus: [5/102, 10/102, 20/102, 30/102, 20/102, 10/102, 5/102, 2/102],
    totalMass: 102,
    poolBalance: 500.0,
    participantCount: 12,
    totalVolume: 1500.0,
    positionsOpen: 5,
    config: {
      numBuckets: 6, lowerBound: 0, upperBound: 100, K: 6, L: 0, H: 100, P0: 100,
      mu: 0.01, epsAlpha: 0.001, tau: 1.0,
      gamma: 0.5, lambdaS: 0.1, lambdaD: 0.05,
    },
    title: 'Market A',
    xAxisUnits: 'USD',
    decimals: 2,
    resolutionState: 'open',
    resolvedOutcome: null,
    marketId: 1,
    createdAt: '2026-03-13T13:48:25.106364',
    expiresAt: null,
    resolvedAt: null,
    marketType: 'standard',
    marketSubtype: null,
    metadata: mockDiscoverMarketsRaw.markets[0].metadata,
    consensusMean: 43.977591036414566,
  },
  {
    alpha: [3, 5, 5, 3],
    consensus: [3/16, 5/16, 5/16, 3/16],
    totalMass: 16,
    poolBalance: 100.0,
    participantCount: 3,
    totalVolume: 200.0,
    positionsOpen: 1,
    config: {
      numBuckets: 2, lowerBound: 0, upperBound: 1, K: 2, L: 0, H: 1, P0: 50,
      mu: 0.01, epsAlpha: 0.001, tau: 1.0,
      gamma: 0.5, lambdaS: 0.1, lambdaD: 0.05,
    },
    title: 'Market B',
    xAxisUnits: '',
    decimals: 0,
    resolutionState: 'resolved',
    resolvedOutcome: 0,
    marketId: 2,
    createdAt: '2026-03-13T13:48:25.106364',
    expiresAt: null,
    resolvedAt: null,
    marketType: 'standard',
    marketSubtype: null,
    metadata: mockDiscoverMarketsRaw.markets[1].metadata,
    consensusMean: 0.5,
  },
];

// -- Query mappings --

describe('queryMarketState', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps all fields correctly including computed consensus and totalMass', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMarketStateRaw),
    });

    const client = makeMockClient();
    const result = await queryMarketState(client, '123');

    expect(result).toEqual(expectedMarketState);
  });

  it('sends GET to correct URL with market_id as path param', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMarketStateRaw),
    });

    const client = makeMockClient();
    await queryMarketState(client, '123');

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/views/markets/123');
    expect(url).not.toContain('market_id=');
  });

  it('throws error when num_buckets is missing', async () => {
    const rawWithoutK = { ...mockMarketStateRaw, num_buckets: undefined };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutK),
    });

    const client = makeMockClient();
    await expect(queryMarketState(client, '123')).rejects.toThrow(
      'Missing num_buckets in market response',
    );
  });

  it('throws error when lower_bound is missing from both metadata and root', async () => {
    const rawWithoutL = {
      ...mockMarketStateRaw,
      lower_bound: undefined,
      metadata: { ...mockMarketStateRaw.metadata, lower_bound: undefined },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutL),
    });

    const client = makeMockClient();
    await expect(queryMarketState(client, '123')).rejects.toThrow(
      'Missing lower_bound in market response',
    );
  });

  it('throws error when upper_bound is missing from both metadata and root', async () => {
    const rawWithoutH = {
      ...mockMarketStateRaw,
      upper_bound: undefined,
      metadata: { ...mockMarketStateRaw.metadata, upper_bound: undefined },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutH),
    });

    const client = makeMockClient();
    await expect(queryMarketState(client, '123')).rejects.toThrow(
      'Missing upper_bound in market response',
    );
  });

  it('uses root lower_bound directly', async () => {
    const rawRootOnly = {
      ...mockMarketStateRaw,
      lower_bound: 10,
      metadata: { ...mockMarketStateRaw.metadata, lower_bound: undefined },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawRootOnly),
    });

    const client = makeMockClient();
    const result = await queryMarketState(client, '123');
    expect(result.config.lowerBound).toBe(10);
  });

  it('ignores metadata lower_bound when root lower_bound is present', async () => {
    const rawConflicting = {
      ...mockMarketStateRaw,
      lower_bound: 10,
      metadata: { ...mockMarketStateRaw.metadata, lower_bound: 999 },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawConflicting),
    });

    const client = makeMockClient();
    const result = await queryMarketState(client, '123');
    expect(result.config.lowerBound).toBe(10);
  });

  it('ignores metadata upper_bound when root upper_bound is present', async () => {
    const rawConflicting = {
      ...mockMarketStateRaw,
      upper_bound: 200,
      metadata: { ...mockMarketStateRaw.metadata, upper_bound: 999 },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawConflicting),
    });

    const client = makeMockClient();
    const result = await queryMarketState(client, '123');
    expect(result.config.upperBound).toBe(200);
  });

  it('ignores metadata title when root title is present', async () => {
    const rawConflicting = {
      ...mockMarketStateRaw,
      title: 'Root Title',
      metadata: { ...mockMarketStateRaw.metadata, title: 'Metadata Title' },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawConflicting),
    });

    const client = makeMockClient();
    const result = await queryMarketState(client, '123');
    expect(result.title).toBe('Root Title');
  });

  it('maps state_vector as a fallback for the renamed single-market consensus field', async () => {
    const rawWithStateVector = {
      ...mockMarketStateRaw,
      alpha_vector: undefined,
      state_vector: [5, 10, 20, 30, 20, 10, 5, 2],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithStateVector),
    });

    const client = makeMockClient();
    const result = await queryMarketState(client, '123');

    expect(result.alpha).toEqual([5, 10, 20, 30, 20, 10, 5, 2]);
    expect(result.consensusMean).toBeCloseTo(expectedMarketState.consensusMean, 6);
  });

  it('throws when no consensus vector field is present', async () => {
    const rawWithoutAlpha = { ...mockMarketStateRaw, alpha_vector: undefined };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutAlpha),
    });

    const client = makeMockClient();
    await expect(queryMarketState(client, '123')).rejects.toThrow(
      'Missing consensus vector',
    );
  });

  it('throws when market_model_params is missing', async () => {
    const rawWithoutMMP = { ...mockMarketStateRaw, market_model_params: undefined };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutMMP),
    });

    const client = makeMockClient();
    await expect(queryMarketState(client, '123')).rejects.toThrow(
      'Missing market_model_params',
    );
  });

  it('returns all-zero consensus for zero-sum alpha (fresh market)', async () => {
    const rawZeroAlpha = { ...mockMarketStateRaw, alpha_vector: [0, 0, 0, 0, 0, 0, 0, 0] };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawZeroAlpha),
    });

    const client = makeMockClient();
    const result = await queryMarketState(client, '123');
    expect(result.consensus).toHaveLength(8);
    expect(result.consensus.every(c => c === 0)).toBe(true);
    expect(result.totalMass).toBe(0);
  });

  it('defaults totalVolume to 0 when total_deposited and total_withdrawn are missing', async () => {
    const rawWithoutVolume = { ...mockMarketStateRaw, total_deposited: undefined, total_withdrawn: undefined };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutVolume),
    });

    const client = makeMockClient();
    const result = await queryMarketState(client, '123');
    expect(result.totalVolume).toBe(0);
  });
});

describe('queryMarketPositions', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps all position fields correctly for both open and closed positions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPositionsRaw),
    });

    const client = makeMockClient();
    const result = await queryMarketPositions(client, '123');

    expect(result).toEqual(expectedPositions);
  });

  it('returns empty array when positions is undefined', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const client = makeMockClient();
    const result = await queryMarketPositions(client, '123');

    expect(result).toEqual([]);
  });

  it('sends GET to correct URL with market_id as path param', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPositionsRaw),
    });

    const client = makeMockClient();
    await queryMarketPositions(client, '123');

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/views/positions/123');
    expect(url).not.toContain('market_id=');
  });

  it('maps raw position with position_type and extracts stdDev from position_params', async () => {
    const normalPosition = {
      positions: [{
        position_id: 'pos_100',
        position_vector: [0.5, 0.5],
        minted_claims: 10,
        collateral: 10,
        status: 'open',
        sold_price: null,
        position_type: 'normal',
        position_params: { mean: 0.5, std_dev: 0.1 },
        username: 'user1',
        created_at: '2026-01-01T00:00:00Z',
        position_closed_at: null,
        settlement_payout: null,
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(normalPosition),
    });

    const client = makeMockClient();
    const result = await queryMarketPositions(client, '1');

    expect(result[0].stdDev).toBe(0.1);
    expect(result[0].positionType).toBe('normal');
    expect(result[0].positionParams).toEqual({ mean: 0.5, std_dev: 0.1 });
    expect(result[0].prediction).toBeNull();
  });

  it('maps raw position with position_type and sets stdDev to null for raw type', async () => {
    const rawPosition = {
      positions: [{
        position_id: 'pos_200',
        position_vector: [0.3, 0.7],
        minted_claims: 5,
        collateral: 5,
        status: 'open',
        sold_price: null,
        position_type: 'raw',
        position_params: {},
        username: 'user2',
        created_at: '2026-01-01T00:00:00Z',
        position_closed_at: null,
        settlement_payout: null,
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawPosition),
    });

    const client = makeMockClient();
    const result = await queryMarketPositions(client, '1');

    expect(result[0].stdDev).toBeNull();
    expect(result[0].positionType).toBe('raw');
    expect(result[0].positionParams).toEqual({});
    expect(result[0].prediction).toBeNull();
  });

  it('forwards raw prediction value when present', async () => {
    const positionWithPrediction = {
      positions: [{
        position_id: 'pos_300',
        position_vector: [0.5, 0.5],
        minted_claims: 10,
        collateral: 10,
        status: 'open',
        sold_price: null,
        position_type: 'normal',
        position_params: { mean: 0.5, std_dev: 0.1 },
        username: 'user1',
        created_at: '2026-01-01T00:00:00Z',
        position_closed_at: null,
        settlement_payout: null,
        prediction: 42.5,
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(positionWithPrediction),
    });

    const client = makeMockClient();
    const result = await queryMarketPositions(client, '1');

    expect(result[0].prediction).toBe(42.5);
  });

  it('throws when position_vector is missing from position', async () => {
    const positionWithoutVector = {
      positions: [{
        position_id: 'pos_400',
        position_vector: null,
        minted_claims: 10,
        collateral: 10,
        status: 'open',
        sold_price: null,
        position_type: 'raw',
        position_params: {},
        username: 'user1',
        created_at: '2026-01-01T00:00:00Z',
        position_closed_at: null,
        settlement_payout: null,
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(positionWithoutVector),
    });

    const client = makeMockClient();
    await expect(queryMarketPositions(client, '1')).rejects.toThrow(
      'Missing position_vector in position data',
    );
  });
});

describe('queryMarketHistory', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps all fields correctly including String() conversion on positionId', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockHistoryRaw),
    });

    const client = makeMockClient();
    const result = await queryMarketHistory(client, '123');

    expect(result).toEqual(expectedHistory);
  });

  it('sends GET to correct URL with market_id as path param and limit/offset as query params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockHistoryRaw),
    });

    const client = makeMockClient();
    await queryMarketHistory(client, '123', 10, 5);

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/views/history/123');
    expect(url).not.toContain('market_id=');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
  });

  it('returns empty snapshots array when snapshots key is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ market_id: '123', total_snapshots: 0 }),
    });

    const client = makeMockClient();
    const result = await queryMarketHistory(client, '123');

    expect(result.snapshots).toEqual([]);
  });

  it('converts numeric position_id to string via String()', async () => {
    const rawWithNumericId = {
      market_id: '123',
      total_snapshots: 1,
      snapshots: [
        {
          snapshot_id: 1,
          trade_id: 101,
          side: 'buy',
          position_id: 123,
          alpha_vector: [5, 10, 20, 30, 20, 10, 5, 2],
          total_deposited: 1000.0,
          total_withdrawn: 200.0,
          total_volume: 1200.0,
          current_pool: 800.0,
          num_open_positions: 5,
          created_at: '2026-01-15T10:30:00Z',
        },
      ],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithNumericId),
    });

    const client = makeMockClient();
    const result = await queryMarketHistory(client, '123');

    expect(result.snapshots[0].positionId).toBe('123');
  });
});

// -- Transaction mappings --

describe('buy', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST body with correct shape { collateral, position_type, position_params }', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBuyResponseRaw),
    });

    const client = makeMockClientWithAuth();
    await buy(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5, { prediction: 50 });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      collateral: 10,
      position_type: 'raw',
      position_params: { position_vector: [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5] },
    });
  });

  it('sends POST to correct URL with market_id as path param', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBuyResponseRaw),
    });

    const client = makeMockClientWithAuth();
    await buy(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5, { prediction: 50 });

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/market/trading/buy/123');
    expect(url).not.toContain('market_id=');
    expect(init.method).toBe('POST');
  });

  it('maps response to BuyResult correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBuyResponseRaw),
    });

    const client = makeMockClientWithAuth();
    const result = await buy(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5, { prediction: 50 });

    expect(result).toEqual(expectedBuyResult);
  });

  it('does not send prediction in POST body even when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBuyResponseRaw),
    });

    const client = makeMockClientWithAuth();
    await buy(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5);

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      collateral: 10,
      position_type: 'raw',
      position_params: { position_vector: [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5] },
    });
    expect(body).not.toHaveProperty('prediction');
  });

  it('backward-compat: buy result works without optional position_type/position_params', async () => {
    const minimalResponse = {
      success: true,
      position: {
        position_id: 99,
        position_vector: [1.0, 1.0, 1.0],
        minted_claims: 5,
        collateral: 10,
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(minimalResponse),
    });

    const client = makeMockClientWithAuth();
    const result = await buy(client, '123', [1.0, 1.0, 1.0], 10, 1);

    expect(result.positionId).toBe(99);
    expect(result.positionType).toBeUndefined();
    expect(result.positionParams).toEqual({});
  });

  it('throws when position is missing in buy response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, position: null }),
    });

    const client = makeMockClientWithAuth();
    await expect(buy(client, '123', [1.0, 1.0, 1.0], 10, 1)).rejects.toThrow(
      'Missing position in buy response',
    );
  });
});

describe('sell', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST to correct URL with marketId and positionId as path params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSellResponseRaw),
    });

    const client = makeMockClientWithAuth();
    await sell(client, 42, '123');

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/market/trading/sell/123/42');
    expect(url).not.toContain('market_id=');
    expect(init.method).toBe('POST');
  });

  it('sends no request body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSellResponseRaw),
    });

    const client = makeMockClientWithAuth();
    await sell(client, 42, '123');

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it('maps response to SellResult correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSellResponseRaw),
    });

    const client = makeMockClientWithAuth();
    const result = await sell(client, 42, '123');

    expect(result).toEqual(expectedSellResult);
  });

  it('backward-compat: sell result works without optional credited_to', async () => {
    const minimalResponse = {
      success: true,
      position_id: 42,
      payout: 95.5,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(minimalResponse),
    });

    const client = makeMockClientWithAuth();
    const result = await sell(client, 42, '123');

    expect(result.positionId).toBe(42);
    expect(result.collateralReturned).toBe(95.5);
    expect(result.creditedTo).toBeUndefined();
  });

  it('throws when payout is missing in sell response', async () => {
    const responseWithoutPayout = {
      success: true,
      position_id: 42,
      credited_to: 'testuser',
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(responseWithoutPayout),
    });

    const client = makeMockClientWithAuth();
    await expect(sell(client, 42, '123')).rejects.toThrow(
      'Missing payout in sell response',
    );
  });

  it('throws when position_id is missing in sell response', async () => {
    const responseWithoutPositionId = {
      success: true,
      payout: 95.5,
      credited_to: 'testuser',
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(responseWithoutPositionId),
    });

    const client = makeMockClientWithAuth();
    await expect(sell(client, 42, '123')).rejects.toThrow(
      'Missing position_id in sell response',
    );
  });
});

// -- Preview mappings --

describe('previewSell', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends GET to correct URL with marketId and positionId as path params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPreviewSellRaw),
    });

    const client = makeMockClient();
    await previewSell(client, 42, '123');

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/views/preview/sell/123/42');
    expect(url).not.toContain('market_id=');
    expect(init.method).toBe('GET');
  });

  it('maps response to PreviewSellResult correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPreviewSellRaw),
    });

    const client = makeMockClient();
    const result = await previewSell(client, 42, '123');

    expect(result).toEqual(expectedPreviewSellResult);
  });

  it('throws when payout is missing in previewSell response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ position_id: 42 }),
    });

    const client = makeMockClient();
    await expect(previewSell(client, 42, '123')).rejects.toThrow(
      'Missing payout in previewSell response',
    );
  });

  it('throws when position_id is missing in previewSell response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ payout: 88.3 }),
    });

    const client = makeMockClient();
    await expect(previewSell(client, 42, '123')).rejects.toThrow(
      'Missing position_id in previewSell response',
    );
  });
});

describe('previewPayoutCurve', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST body with correct shape { collateral, position_type, position_params, num_outcomes }', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPayoutCurveRaw),
    });

    const client = makeMockClientWithAuth();
    await previewPayoutCurve(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5, 100);

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      collateral: 10,
      position_type: 'raw',
      position_params: { position_vector: [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5] },
      num_outcomes: 100,
    });
  });

  it('omits num_outcomes from POST body when undefined', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPayoutCurveRaw),
    });

    const client = makeMockClientWithAuth();
    await previewPayoutCurve(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5);

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      collateral: 10,
      position_type: 'raw',
      position_params: { position_vector: [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5] },
    });
    expect(body).not.toHaveProperty('num_outcomes');
  });

  it('sends POST to correct URL with market_id as path param', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPayoutCurveRaw),
    });

    const client = makeMockClientWithAuth();
    await previewPayoutCurve(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5, 100);

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/views/preview/payout/123');
    expect(url).not.toContain('market_id=');
    expect(init.method).toBe('POST');
  });

  it('maps response correctly including projections->previews and profit_loss->profitLoss', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPayoutCurveRaw),
    });

    const client = makeMockClientWithAuth();
    const result = await previewPayoutCurve(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5, 100);

    expect(result).toEqual(expectedPayoutCurve);
  });

  it('throws when max_payout is missing in payout curve response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockPayoutCurveRaw, max_payout: undefined }),
    });

    const client = makeMockClientWithAuth();
    await expect(
      previewPayoutCurve(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5, 100),
    ).rejects.toThrow('Missing max_payout in payout curve response');
  });

  it('throws when max_payout_outcome is missing in payout curve response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockPayoutCurveRaw, max_payout_outcome: undefined }),
    });

    const client = makeMockClientWithAuth();
    await expect(
      previewPayoutCurve(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5, 100),
    ).rejects.toThrow('Missing max_payout_outcome in payout curve response');
  });

  it('throws when collateral is missing in payout curve response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockPayoutCurveRaw, collateral: undefined }),
    });

    const client = makeMockClientWithAuth();
    await expect(
      previewPayoutCurve(client, '123', [0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 0.5], 10, 5, 100),
    ).rejects.toThrow('Missing collateral in payout curve response');
  });
});

// -- Auth mappings --
// Note: passwordlessLoginUser and silentReAuth tested in api-integration.test.ts (lines 461-616)

describe('loginUser', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST body with { username, password }', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLoginResponseRaw),
    });

    const client = makeMockClient();
    await loginUser(client, 'testuser', 'testpass');

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({ username: 'testuser', password: 'testpass' });
  });

  it('sends POST to /api/auth/login', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLoginResponseRaw),
    });

    const client = makeMockClient();
    await loginUser(client, 'testuser', 'testpass');

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/auth/login');
  });

  it('returns { user, token } with user mapped via mapUserProfile', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLoginResponseRaw),
    });

    const client = makeMockClient();
    const result = await loginUser(client, 'testuser', 'testpass');

    expect(result).toEqual({
      user: {
        userId: 1,
        username: 'testuser',
        walletValue: 1000.0,
        role: 'trader',
      },
      token: 'jwt-token-123',
    });
  });
});

describe('signupUser', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST body with { username, password } when no access code', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSignupResponseRaw),
    });

    const client = makeMockClient();
    await signupUser(client, 'newuser', 'newpass');

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({ username: 'newuser', password: 'newpass' });
    expect(body).not.toHaveProperty('access_code');
  });

  it('sends POST body with { username, password, access_code } when access code provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSignupResponseRaw),
    });

    const client = makeMockClient();
    await signupUser(client, 'newuser', 'newpass', { accessCode: 'INVITE123' });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({ username: 'newuser', password: 'newpass', access_code: 'INVITE123' });
  });

  it('sends POST to /api/auth/signup', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSignupResponseRaw),
    });

    const client = makeMockClient();
    await signupUser(client, 'newuser', 'newpass');

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/auth/signup');
  });

  it('returns { user } with user mapped via mapUserProfile', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSignupResponseRaw),
    });

    const client = makeMockClient();
    const result = await signupUser(client, 'newuser', 'newpass');

    expect(result).toEqual({
      user: {
        userId: 2,
        username: 'newuser',
        walletValue: 0,
        role: 'trader',
      },
    });
  });
});

describe('fetchCurrentUser', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps nested response { user: {...} } correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCurrentUserNested),
    });

    const client = makeMockClientWithAuth();
    const result = await fetchCurrentUser(client);

    expect(result).toEqual(expectedCurrentUser);
  });

  it('maps flat response { user_id, ... } correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCurrentUserFlat),
    });

    const client = makeMockClientWithAuth();
    const result = await fetchCurrentUser(client);

    expect(result).toEqual(expectedCurrentUser);
  });

  it('sends GET to /api/auth/me', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCurrentUserNested),
    });

    const client = makeMockClientWithAuth();
    await fetchCurrentUser(client);

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/auth/me');
  });

  it('defaults walletValue to 0 when wallet_value is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: {
          user_id: 1,
          username: 'testuser',
          role: 'admin',
        },
      }),
    });

    const client = makeMockClientWithAuth();
    const result = await fetchCurrentUser(client);

    expect(result.walletValue).toBe(0);
  });

  it('defaults role to trader when role is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: {
          user_id: 1,
          username: 'testuser',
          wallet_value: 500,
        },
      }),
    });

    const client = makeMockClientWithAuth();
    const result = await fetchCurrentUser(client);

    expect(result.role).toBe('trader');
  });
});

// -- Discovery mappings --

describe('discoverMarkets', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps wrapped markets array correctly including open and resolved states', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDiscoverMarketsRaw),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);

    expect(result).toEqual(expectedDiscoverMarkets);
  });

  it('sends GET to /api/views/markets/list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDiscoverMarketsRaw),
    });

    const client = makeMockClient();
    await discoverMarkets(client);

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/views/markets/list');
  });

  it('returns empty array when markets array is empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ markets: [] }),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);

    expect(result).toEqual([]);
  });

  it('returns empty array when markets key is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);

    expect(result).toEqual([]);
  });

  it('skips list item when lower_bound is missing', async () => {
    const rawWithoutL = {
      markets: [{
        ...mockDiscoverMarketsRaw.markets[0],
        lower_bound: undefined,
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutL),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);
    expect(result).toEqual([]);
  });

  it('skips list item when upper_bound is missing', async () => {
    const rawWithoutH = {
      markets: [{
        ...mockDiscoverMarketsRaw.markets[0],
        upper_bound: undefined,
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutH),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);
    expect(result).toEqual([]);
  });

  it('skips list item when num_buckets is missing', async () => {
    const rawWithoutK = {
      markets: [{
        ...mockDiscoverMarketsRaw.markets[0],
        num_buckets: undefined,
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutK),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);
    expect(result).toEqual([]);
  });

  it('skips malformed list items and keeps valid markets', async () => {
    const rawWithoutAlpha = {
      markets: [
        {
          ...mockDiscoverMarketsRaw.markets[0],
          alpha_vector: undefined,
        },
        mockDiscoverMarketsRaw.markets[1],
      ],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutAlpha),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);
    expect(result).toEqual([expectedDiscoverMarkets[1]]);
  });

  it('maps state_vector as a fallback for the renamed list consensus field', async () => {
    const rawWithStateVector = {
      markets: [{
        ...mockDiscoverMarketsRaw.markets[0],
        alpha_vector: undefined,
        state_vector: [5, 10, 20, 30, 20, 10, 5, 2],
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithStateVector),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);

    expect(result).toHaveLength(1);
    expect(result[0].alpha).toEqual([5, 10, 20, 30, 20, 10, 5, 2]);
    expect(result[0].consensusMean).toBeCloseTo(expectedDiscoverMarkets[0].consensusMean, 6);
  });

  it('skips list item when market_model_params is missing', async () => {
    const rawWithoutMMP = {
      markets: [{
        ...mockDiscoverMarketsRaw.markets[0],
        market_model_params: undefined,
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutMMP),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);
    expect(result).toEqual([]);
  });

  it('returns all-zero consensus for zero-sum alpha in list item (fresh market)', async () => {
    const rawZeroAlpha = {
      markets: [{
        ...mockDiscoverMarketsRaw.markets[0],
        alpha_vector: [0, 0, 0, 0, 0, 0, 0, 0],
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawZeroAlpha),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);
    expect(result).toHaveLength(1);
    expect(result[0].consensus).toHaveLength(8);
    expect(result[0].consensus.every(c => c === 0)).toBe(true);
    expect(result[0].totalMass).toBe(0);
  });

  it('defaults totalVolume to 0 when total_deposited and total_withdrawn are missing from list item', async () => {
    const rawWithoutVolume = {
      markets: [{
        ...mockDiscoverMarketsRaw.markets[0],
        total_deposited: undefined,
        total_withdrawn: undefined,
      }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawWithoutVolume),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);

    expect(result[0].totalVolume).toBe(0);
  });

  it('N1: returns empty array when markets is a non-array value', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ markets: 'not-an-array' }),
    });

    const client = makeMockClient();
    const result = await discoverMarkets(client);

    expect(result).toEqual([]);
  });
});

// -- N3: fetchCurrentUser empty-string role default --

describe('fetchCurrentUser (N3)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('defaults role to trader when role is empty string', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: {
          user_id: 1,
          username: 'testuser',
          wallet_value: 500,
          role: '',
        },
      }),
    });

    const client = makeMockClientWithAuth();
    const result = await fetchCurrentUser(client);

    expect(result.role).toBe('trader');
  });
});

// -- N5: queryMarketHistory without limit/offset --

describe('queryMarketHistory (N5)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends GET without limit/offset query params when not provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockHistoryRaw),
    });

    const client = makeMockClient();
    await queryMarketHistory(client, '123');

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/views/history/123');
    expect(url).not.toContain('limit=');
    expect(url).not.toContain('offset=');
  });
});

// -- Validation integration tests --

describe('buy validation integration', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects wrong-length belief vector before fetch is called', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const client = makeMockClientWithAuth();
    await expect(
      buy(client, '123', [0.5, 0.5], 10, 5),
    ).rejects.toThrow('length 2');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('previewPayoutCurve validation integration', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects wrong-length belief vector before fetch is called', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const client = makeMockClientWithAuth();
    await expect(
      previewPayoutCurve(client, '123', [0.5, 0.5], 10, 5, 100),
    ).rejects.toThrow('length 2');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
