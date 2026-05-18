import type { FSClient } from '../client.js';
import type { MarketState, ConsensusSummary, ConsensusCurve } from '../types.js';
import { evaluateDensityPiecewise, evaluateDensityCurve, computeStatistics } from '../math/density.js';

/**
 * Returns complete market state.
 * Wraps: GET /api/views/markets/{market_id}
 */
export async function queryMarketState(
  client: FSClient,
  marketId: string | number,
  options?: { signal?: AbortSignal },
): Promise<MarketState> {
  const data = await client.get<any>(`/api/views/markets/${marketId}`, undefined, options?.signal);

  const rawAlphaVector = data.alpha_vector ?? data.state_vector;
  if (!Array.isArray(rawAlphaVector)) throw new Error('Missing consensus vector in market response');
  const alphaVector: number[] = rawAlphaVector;
  const totalMass = alphaVector.reduce((a: number, b: number) => a + b, 0);
  const consensus = totalMass > 0
    ? alphaVector.map((a: number) => a / totalMass)
    : alphaVector.map(() => 0);
  const mp = data.market_model_params;
  if (!mp) throw new Error('Missing market_model_params in market response');

  const numBuckets = data.num_buckets;
  if (numBuckets == null) throw new Error('Missing num_buckets in market response');
  const lowerBound = data.lower_bound;
  if (lowerBound == null) throw new Error('Missing lower_bound in market response');
  const upperBound = data.upper_bound;
  if (upperBound == null) throw new Error('Missing upper_bound in market response');

  const n = consensus.length - 1;
  const consensusMean = n > 0
    ? lowerBound + (upperBound - lowerBound) * consensus.reduce((sum: number, c: number, k: number) => sum + (k / n) * c, 0)
    : lowerBound;

  return {
    alpha: alphaVector,
    consensus,
    totalMass,
    poolBalance: data.current_pool,
    participantCount: data.num_positions,
    totalVolume: (data.total_deposited ?? 0) + (data.total_withdrawn ?? 0),
    positionsOpen: data.positions_currently_open ?? 0,
    config: {
      numBuckets,
      lowerBound,
      upperBound,
      K: numBuckets,      // deprecated alias
      L: lowerBound,      // deprecated alias
      H: upperBound,      // deprecated alias
      P0: mp.P0,
      mu: mp.mu,
      epsAlpha: mp.eps_alpha,
      tau: mp.tau,
      gamma: mp.gamma,
      lambdaS: mp.lambda_s,
      lambdaD: mp.lambda_d,
    },
    title: data.title,
    xAxisUnits: data.metadata?.x_axis_units ?? '',
    decimals: data.metadata?.decimals ?? 0,
    // TODO: Add 'voided' mapping when API provides the field. Currently only is_settled boolean maps to 'resolved'/'open'.
    resolutionState: data.is_settled ? 'resolved' : 'open',
    resolvedOutcome: data.settlement_outcome ?? null,
    marketId: data.market_id,
    createdAt: data.created_at ?? null,
    expiresAt: data.expires_at ?? null,
    resolvedAt: data.resolved_at ?? null,
    marketType: data.market_type ?? 'standard',
    marketSubtype: data.market_subtype ?? null,
    metadata: data.metadata ?? {},
    consensusMean,
  };
}

/**
 * Returns the consensus PDF as a renderable curve.
 * Routes through queryMarketState, then evaluates client-side.
 */
export async function getConsensusCurve(
  client: FSClient,
  marketId: string | number,
  numPoints: number = 200,
  options?: { signal?: AbortSignal },
): Promise<ConsensusCurve> {
  const market = await queryMarketState(client, marketId, options);
  const points = evaluateDensityCurve(
    market.consensus,
    market.config.lowerBound,
    market.config.upperBound,
    numPoints,
  );
  return { points, config: market.config };
}

/**
 * Returns statistical summary of consensus distribution.
 * Computed client-side from consensus coefficients.
 */
export async function queryConsensusSummary(
  client: FSClient,
  marketId: string | number,
  options?: { signal?: AbortSignal },
): Promise<ConsensusSummary> {
  const market = await queryMarketState(client, marketId, options);
  return computeStatistics(market.consensus, market.config.lowerBound, market.config.upperBound);
}

/**
 * Returns probability density at a specific point on the consensus PDF.
 */
export async function queryDensityAt(
  client: FSClient,
  marketId: string | number,
  x: number,
  options?: { signal?: AbortSignal },
): Promise<{ x: number; density: number }> {
  const market = await queryMarketState(client, marketId, options);
  const density = evaluateDensityPiecewise(
    market.consensus,
    x,
    market.config.lowerBound,
    market.config.upperBound,
  );
  return { x, density };
}
