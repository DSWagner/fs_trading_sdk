import React, { useContext, useMemo, useId } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { evaluateDensityCurve } from '@functionspace/core';
import type { MarketState, ConsensusCurve } from '@functionspace/core';
import { FunctionSpaceContext, useMarket, useConsensus, useChartZoom, rechartsPlotArea } from '@functionspace/react';
import type { OverlayCurve } from './types.js';
import '../styles/base.css';

// ── Content component (used by MarketCharts and standalone) ──

interface ChartPoint {
  x: number;
  consensus: number;
  preview?: number;
  payout?: number;
  [key: string]: number | undefined;
}

export interface ConsensusChartContentProps {
  market: MarketState;
  consensus: ConsensusCurve;
  height: number;
  overlayCurves?: OverlayCurve[];
  zoomable?: boolean;
  /**
   * Custom formatter for the X-axis tick labels (the outcome scale).
   * Defaults to `v.toFixed(1)`. Passing a smarter formatter is the
   * preferred way to display integer-priced markets without trailing
   * `.0` decimals (e.g. `(v) => Math.round(v).toLocaleString('en-US')`).
   */
  xAxisTickFormatter?: (value: number) => string;
  /**
   * Custom formatter for the Y-axis tick labels (probability density).
   * Defaults to `v.toFixed(3)`. Pass a smarter formatter when the
   * density values fall outside the range that 3 fixed decimals
   * displays cleanly.
   */
  yAxisTickFormatter?: (value: number) => string;
  /**
   * Custom formatter for the tooltip "Outcome" label and the
   * consensus / preview / selected / payout values. Receives the raw
   * value and a kind discriminator so a single function can format
   * every tooltip line. Defaults to the existing `.toFixed(...)`
   * behavior.
   */
  tooltipValueFormatter?: (value: number, kind: 'outcome' | 'consensus' | 'preview' | 'selected' | 'payout' | 'overlay') => string;
}

export function ConsensusChartContent({
  market,
  consensus,
  height,
  overlayCurves,
  zoomable,
  xAxisTickFormatter,
  yAxisTickFormatter,
  tooltipValueFormatter,
}: ConsensusChartContentProps) {
  const ctx = useContext(FunctionSpaceContext);
  if (!ctx) throw new Error('ConsensusChartContent must be used within FunctionSpaceProvider');

  const uniqueId = useId();
  const consensusGradId = `${uniqueId}-consensus-grad`;
  const previewGradId = `${uniqueId}-preview-grad`;
  const selectedGradId = `${uniqueId}-selected-grad`;

  // Build chart data merging consensus, preview belief, payout, and overlays
  const chartData = useMemo<ChartPoint[]>(() => {
    const points: ChartPoint[] = consensus.points.map((p) => ({
      x: Math.round(p.x * 100) / 100,
      consensus: p.y,
    }));

    // Add preview belief overlay (from trade panel)
    // Uses coefficient-direct interpolation for sharp edges (not Bernstein polynomial which smooths)
    if (ctx.previewBelief && market) {
      const { lowerBound, upperBound } = market.config;
      const previewCurve = evaluateDensityCurve(ctx.previewBelief, lowerBound, upperBound, points.length);
      for (let i = 0; i < points.length && i < previewCurve.length; i++) {
        points[i].preview = previewCurve[i].y;
      }
    }

    // Add selected position curve from context (automatic component coordination)
    if (ctx.selectedPosition?.belief && market) {
      const { lowerBound, upperBound } = market.config;
      const selectedCurve = evaluateDensityCurve(ctx.selectedPosition.belief, lowerBound, upperBound, points.length);
      for (let i = 0; i < points.length && i < selectedCurve.length; i++) {
        points[i].selected = selectedCurve[i].y;
      }
    }

    // Add overlay curves (passed via props for advanced use)
    if (overlayCurves && market) {
      for (const overlay of overlayCurves) {
        for (let i = 0; i < points.length && i < overlay.curve.length; i++) {
          points[i][overlay.id] = overlay.curve[i].y;
        }
      }
    }

    // Add payout data (tooltip-only)
    if (ctx.previewPayout?.previews && market) {
      const previews = ctx.previewPayout.previews;
      for (const point of points) {
        let best = previews[0];
        let bestDist = Math.abs(best.outcome - point.x);
        for (let j = 1; j < previews.length; j++) {
          const dist = Math.abs(previews[j].outcome - point.x);
          if (dist < bestDist) {
            best = previews[j];
            bestDist = dist;
          }
        }
        const step = (market.config.upperBound - market.config.lowerBound) / (market.config.numBuckets || 50);
        if (bestDist < step * 2) {
          point.payout = best.payout;
        }
      }
    }

    return points;
  }, [consensus, ctx.previewBelief, ctx.previewPayout, ctx.selectedPosition, overlayCurves, market]);

  // Dynamic Y-axis domain for density
  // Caps preview influence so the consensus curve always remains visible
  const densityDomain = useMemo<[number, number]>(() => {
    if (!chartData.length) return [0, 0.1];
    let consensusMax = 0;
    let overlayMax = 0;
    for (const d of chartData) {
      if (d.consensus > consensusMax) consensusMax = d.consensus;
      if (d.preview !== undefined && d.preview > overlayMax) overlayMax = d.preview;
      if (d.selected !== undefined && d.selected > overlayMax) overlayMax = d.selected;
      if (overlayCurves) {
        for (const overlay of overlayCurves) {
          const val = d[overlay.id];
          if (val !== undefined && val > overlayMax) overlayMax = val;
        }
      }
    }
    // Preview/overlays can stretch the axis up to 4x consensus height
    // Beyond that, peaks get clipped  -- keeps consensus visible
    const cappedOverlay = Math.min(overlayMax, consensusMax * 4);
    const max = Math.max(consensusMax, cappedOverlay);
    return [0, max * 1.15];
  }, [chartData, overlayCurves]);

  // Payout Y-axis domain
  const payoutDomain = useMemo<[number, number]>(() => {
    if (!chartData.length) return [0, 100];
    let max = 0;
    for (const d of chartData) {
      if (d.payout !== undefined && d.payout > max) max = d.payout;
    }
    return [0, Math.max(max * 1.1, 10)];
  }, [chartData]);

  // Zoom support
  const fullXDomain = useMemo<[number, number]>(() => {
    if (!chartData.length) return [0, 1];
    return [chartData[0].x, chartData[chartData.length - 1].x];
  }, [chartData]);

  const getPlotArea = useMemo(() => rechartsPlotArea({ left: 10, right: 15 }, 60), []);

  const zoom = useChartZoom({
    data: chartData,
    xKey: 'x',
    fullXDomain,
    getPlotArea,
    enabled: zoomable,
  });

  const hasPreview = ctx.previewBelief !== null;
  const hasSelected = ctx.selectedPosition !== null;
  const hasPayout = chartData.some((d) => d.payout !== undefined);

  const formatTooltip = (value: number, kind: 'outcome' | 'consensus' | 'preview' | 'selected' | 'payout' | 'overlay'): string => {
    if (tooltipValueFormatter) return tooltipValueFormatter(value, kind);
    if (kind === 'payout') return value.toFixed(2);
    return value.toFixed(4);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="fs-tooltip">
        <p className="fs-tooltip-label">Outcome: {formatTooltip(Number(label), 'outcome')}</p>
        {payload.map((entry: any, i: number) => {
          if (entry.dataKey === 'consensus') {
            return (
              <p key={i} className="fs-tooltip-row" style={{ color: ctx.chartColors.consensus }}>
                Market Consensus: {entry.value !== undefined ? formatTooltip(entry.value, 'consensus') : ''}
              </p>
            );
          }
          if (entry.dataKey === 'preview') {
            return (
              <p key={i} className="fs-tooltip-row" style={{ color: ctx.chartColors.previewLine }}>
                Trade Preview: {entry.value !== undefined ? formatTooltip(entry.value, 'preview') : ''}
              </p>
            );
          }
          if (entry.dataKey === 'selected') {
            return (
              <p key={i} className="fs-tooltip-row" style={{ color: ctx.chartColors.positions[0] }}>
                Selected Position: {entry.value !== undefined ? formatTooltip(entry.value, 'selected') : ''}
              </p>
            );
          }
          if (entry.dataKey === 'payout' && entry.value > 0) {
            return (
              <p key={i} className="fs-tooltip-row" style={{ color: ctx.chartColors.payout }}>
                Potential Payout: ${formatTooltip(entry.value, 'payout')}
              </p>
            );
          }
          const overlay = overlayCurves?.find(o => o.id === entry.dataKey);
          if (overlay && entry.value !== undefined) {
            return (
              <p key={i} className="fs-tooltip-row" style={{ color: overlay.color || ctx.chartColors.payout }}>
                {overlay.label}: {formatTooltip(entry.value, 'overlay')}
              </p>
            );
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div className="fs-chart-body" ref={zoom.containerRef} {...zoom.containerProps} style={{ height, ...zoom.containerProps.style }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 25, right: 15, left: 10, bottom: 30 }}>
          <defs>
            <linearGradient id={consensusGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={ctx.chartColors.consensus} stopOpacity={0.4} />
              <stop offset="95%" stopColor={ctx.chartColors.consensus} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id={previewGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={ctx.chartColors.previewLine} stopOpacity={0.3} />
              <stop offset="95%" stopColor={ctx.chartColors.previewLine} stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id={selectedGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={ctx.chartColors.positions[0]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={ctx.chartColors.positions[0]} stopOpacity={0.0} />
            </linearGradient>
            {/* Dynamic gradients for overlay curves */}
            {overlayCurves?.map((overlay) => (
              <linearGradient key={`grad-${overlay.id}`} id={`${uniqueId}-overlay-grad-${overlay.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={overlay.color || ctx.chartColors.payout} stopOpacity={0.3} />
                <stop offset="95%" stopColor={overlay.color || ctx.chartColors.payout} stopOpacity={0.0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={ctx.chartColors.grid} vertical={false} />

          <XAxis
            dataKey="x"
            type="number"
            domain={zoomable ? zoom.xDomain : ['dataMin', 'dataMax']}
            allowDataOverflow={zoomable && zoom.isZoomed}
            tick={{ fill: ctx.chartColors.axisText, fontSize: 12 }}
            tickFormatter={xAxisTickFormatter ?? ((v: number) => v.toFixed(1))}
            label={{
              value: `Outcome${market?.xAxisUnits ? ` (${market.xAxisUnits})` : ''}`,
              position: 'insideBottom',
              offset: -15,
              fill: ctx.chartColors.axisText,
              fontSize: 12,
            }}
          />

          <YAxis
            yAxisId="left"
            domain={densityDomain}
            tick={{ fill: ctx.chartColors.axisText, fontSize: 10 }}
            tickFormatter={yAxisTickFormatter ?? ((v: number) => v.toFixed(3))}
            label={{
              value: 'Probability Density',
              angle: -90,
              position: 'insideLeft',
              fill: ctx.chartColors.axisText,
              fontSize: 11,
              dy: 50,
            }}
          />

          {hasPayout && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={payoutDomain}
              hide={true}
            />
          )}

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: ctx.chartColors.crosshair, strokeWidth: 1, strokeDasharray: '4 4' }}
          />

          <Legend
            wrapperStyle={{ paddingTop: '10px' }}
            formatter={(value: string) => {
              if (value === 'consensus') return <span style={{ color: ctx.chartColors.consensus, fontSize: '0.75rem' }}>Market Consensus</span>;
              if (value === 'preview') return <span style={{ color: ctx.chartColors.previewLine, fontSize: '0.75rem' }}>Trade Preview</span>;
              if (value === 'selected') return <span style={{ color: ctx.chartColors.positions[0], fontSize: '0.75rem' }}>Selected Position</span>;
              const overlay = overlayCurves?.find(o => o.id === value);
              if (overlay) return <span style={{ color: overlay.color || ctx.chartColors.payout, fontSize: '0.75rem' }}>{overlay.label}</span>;
              return null;
            }}
          />

          {/* Consensus area  -- blue */}
          <Area
            yAxisId="left"
            type="linear"
            dataKey="consensus"
            stroke={ctx.chartColors.consensus}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#${consensusGradId})`}
            name="consensus"
            isAnimationActive={false}
          />

          {/* Preview area  -- yellow dashed, linear interpolation for sharp edges */}
          {hasPreview && (
            <Area
              yAxisId="left"
              type="linear"
              dataKey="preview"
              stroke={ctx.chartColors.previewLine}
              strokeWidth={2}
              strokeDasharray="5 5"
              fillOpacity={1}
              fill={`url(#${previewGradId})`}
              name="preview"
              animationDuration={300}
            />
          )}

          {/* Selected position  -- green (from context, automatic coordination) */}
          {hasSelected && (
            <Area
              yAxisId="left"
              type="linear"
              dataKey="selected"
              stroke={ctx.chartColors.positions[0]}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${selectedGradId})`}
              name="selected"
              animationDuration={300}
            />
          )}

          {/* Payout  -- tooltip-only, invisible line for data access */}
          {hasPayout && (
            <Area
              yAxisId="right"
              type="linear"
              dataKey="payout"
              stroke="transparent"
              strokeWidth={0}
              fill="transparent"
              name="payout"
              connectNulls
              legendType="none"
            />
          )}

          {/* Overlay curves  -- from props */}
          {overlayCurves?.map((overlay) => (
            <Area
              key={overlay.id}
              yAxisId="left"
              type="linear"
              dataKey={overlay.id}
              stroke={overlay.color || ctx.chartColors.payout}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${uniqueId}-overlay-grad-${overlay.id})`}
              name={overlay.id}
              animationDuration={300}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Standalone component ──

export interface ConsensusChartProps {
  marketId: string | number;
  height?: number;
  overlayCurves?: OverlayCurve[];
  zoomable?: boolean;
  /** See ConsensusChartContentProps.xAxisTickFormatter. */
  xAxisTickFormatter?: (value: number) => string;
  /** See ConsensusChartContentProps.yAxisTickFormatter. */
  yAxisTickFormatter?: (value: number) => string;
  /** See ConsensusChartContentProps.tooltipValueFormatter. */
  tooltipValueFormatter?: (value: number, kind: 'outcome' | 'consensus' | 'preview' | 'selected' | 'payout' | 'overlay') => string;
}

export function ConsensusChart({
  marketId,
  height = 300,
  overlayCurves,
  zoomable,
  xAxisTickFormatter,
  yAxisTickFormatter,
  tooltipValueFormatter,
}: ConsensusChartProps) {
  const ctx = useContext(FunctionSpaceContext);
  if (!ctx) throw new Error('ConsensusChart must be used within FunctionSpaceProvider');

  const { market } = useMarket(marketId);
  const { consensus, loading, error } = useConsensus(marketId, 100);

  const hasPreview = ctx.previewBelief !== null;

  const subtitle = hasPreview
    ? 'Compare market consensus with your trade preview'
    : 'Current market probability density';

  if (loading) {
    return (
      <div className="fs-chart-container" style={{ minHeight: height, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--fs-text-secondary)' }}>Loading consensus data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fs-chart-container" style={{ minHeight: height, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--fs-negative)' }}>Error: {error.message}</span>
      </div>
    );
  }

  if (!market || !consensus) return null;

  return (
    <div className="fs-chart-container">
      <div className="fs-chart-header">
        <div className="fs-chart-header-row">
          <div>
            <h3 className="fs-chart-title">{market.title || 'Consensus'}</h3>
            <p className="fs-chart-subtitle">{subtitle}</p>
          </div>
        </div>
      </div>
      <ConsensusChartContent
        market={market}
        consensus={consensus}
        height={height}
        overlayCurves={overlayCurves}
        zoomable={zoomable}
        xAxisTickFormatter={xAxisTickFormatter}
        yAxisTickFormatter={yAxisTickFormatter}
        tooltipValueFormatter={tooltipValueFormatter}
      />
    </div>
  );
}
