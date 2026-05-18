import type { FSClient } from '../client.js';
import type { MarketState, MarketDiscoveryOptions } from '../types.js';
import { filterMarkets } from './filters.js';

/**
 * List available markets with optional filtering, sorting, and limiting.
 * Wraps: GET /api/views/markets/list
 *
 * Category: Discovery | Layer: L1
 */
export async function discoverMarkets(
  client: FSClient,
  options?: MarketDiscoveryOptions,
): Promise<MarketState[]> {
  const data = await client.get<any>('/api/views/markets/list', undefined, options?.signal);
  const items = Array.isArray(data.markets) ? data.markets : [];

  const mapped: MarketState[] = items.flatMap((item: any) => {
    const mapped = mapMarketListItem(item);
    return mapped ? [mapped] : [];
  });

  // Apply client-side filtering, sorting, and limiting if any options provided
  const hasFilterOptions = options && (
    options.state !== undefined ||
    options.titleContains !== undefined ||
    options.categories !== undefined ||
    options.filters !== undefined ||
    options.sortBy !== undefined ||
    options.limit !== undefined
  );

  if (hasFilterOptions) {
    const { signal: _signal, ...filterOptions } = options!;
    return filterMarkets(mapped, filterOptions);
  }

  return mapped;
}

function mapMarketListItem(item: any): MarketState | null {
  const rawAlphaVector = item.alpha_vector ?? item.state_vector;
  if (!Array.isArray(rawAlphaVector)) return null;
  const alphaVector: number[] = rawAlphaVector;
  const totalMass = alphaVector.reduce((a: number, b: number) => a + b, 0);
  const consensus = totalMass > 0
    ? alphaVector.map((a: number) => a / totalMass)
    : alphaVector.map(() => 0);
  const mp = item.market_model_params;
  if (!mp) return null;

  const numBuckets = item.num_buckets;
  if (numBuckets == null) return null;
  const lowerBound = item.lower_bound;
  if (lowerBound == null) return null;
  const upperBound = item.upper_bound;
  if (upperBound == null) return null;

  const n = consensus.length - 1;
  const consensusMean = n > 0
    ? lowerBound + (upperBound - lowerBound) * consensus.reduce((sum: number, c: number, k: number) => sum + (k / n) * c, 0)
    : lowerBound;

  return {
    alpha: alphaVector,
    consensus,
    totalMass,
    poolBalance: item.current_pool,
    participantCount: item.total_positions,
    totalVolume: (item.total_deposited ?? 0) + (item.total_withdrawn ?? 0),
    positionsOpen: item.open_positions ?? 0,
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
    title: item.title,
    xAxisUnits: item.metadata?.x_axis_units ?? '',
    decimals: item.metadata?.decimals ?? 0,
    // TODO: Add 'voided' mapping when API provides the field. Currently only is_settled boolean maps to 'resolved'/'open'.
    resolutionState: item.is_settled ? 'resolved' : 'open',
    resolvedOutcome: item.settlement_outcome ?? null,
    marketId: item.market_id,
    createdAt: item.created_at ?? null,
    expiresAt: item.expires_at ?? null,
    resolvedAt: item.resolved_at ?? null,
    marketType: item.market_type ?? 'standard',
    marketSubtype: item.market_subtype ?? null,
    metadata: item.metadata ?? {},
    consensusMean,
  };
}
