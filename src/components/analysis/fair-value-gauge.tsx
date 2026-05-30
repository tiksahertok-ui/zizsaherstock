'use client';

import React, { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { fmtCurrency, fmtPercent, pnlColor } from '@/utils/formatters';

// ── Props ──────────────────────────────────────────────────────

interface FairValueGaugeProps {
  currentPrice: number;
  fairValue: number;
  upside: number; // percentage
  status: 'Undervalued' | 'Fairly Valued' | 'Overvalued' | 'N/A';
  animated?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────

function getStatusColor(status: string) {
  switch (status) {
    case 'Undervalued':
      return { stroke: '#10b981', fill: '#10b981', bg: 'rgba(16, 185, 129, 0.08)', label: 'text-emerald-600 dark:text-emerald-400' };
    case 'Fairly Valued':
      return { stroke: '#f59e0b', fill: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', label: 'text-amber-600 dark:text-amber-400' };
    case 'Overvalued':
      return { stroke: '#ef4444', fill: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', label: 'text-red-600 dark:text-red-400' };
    default:
      return { stroke: '#6b7280', fill: '#6b7280', bg: 'rgba(107, 114, 128, 0.08)', label: 'text-muted-foreground' };
  }
}

// ── Gauge Component ────────────────────────────────────────────

function GaugeSVG({
  currentPrice,
  fairValue,
  upside,
  status,
  animated,
}: FairValueGaugeProps) {
  const colors = getStatusColor(status);

  // Calculate needle position on a 0-100 scale
  // 50 = center (fair value), 0 = deeply undervalued, 100 = deeply overvalued
  // The range is centered on fair value, with ±100% representing extremes
  const ratio = fairValue > 0 && currentPrice > 0 ? currentPrice / fairValue : 1;
  // Map ratio to 0-100: ratio=0.5 -> 0, ratio=1 -> 50, ratio=2 -> 100
  const needlePercent = Math.max(0, Math.min(100, (ratio / 2) * 100));

  // When not animating, start at the final position; when animating, start at 0
  const [progress, setProgress] = useState(animated ? 0 : needlePercent);

  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => setProgress(needlePercent), 100);
      return () => clearTimeout(timer);
    }
  }, [needlePercent, animated]);

  // SVG arc parameters (semicircle from left to right, 180°)
  const radius = 90;
  const cx = 100;
  const cy = 100;
  const startAngle = -210; // degrees (left side, slightly past horizontal)
  const endAngle = 30;    // degrees (right side, slightly past horizontal)
  const totalAngle = endAngle - startAngle; // 240°
  const circumference = (totalAngle / 360) * 2 * Math.PI * radius;

  // Value at the current needle position
  const valueAngle = startAngle + (progress / 100) * totalAngle;
  const valueRad = (valueAngle * Math.PI) / 180;

  const needleX = cx + (radius - 10) * Math.cos(valueRad);
  const needleY = cy + (radius - 10) * Math.sin(valueRad);

  // Arc path (background)
  const arcStartX = cx + radius * Math.cos((startAngle * Math.PI) / 180);
  const arcStartY = cy + radius * Math.sin((startAngle * Math.PI) / 180);
  const arcEndX = cx + radius * Math.cos((endAngle * Math.PI) / 180);
  const arcEndY = cy + radius * Math.sin((endAngle * Math.PI) / 180);

  const arcD = `M ${arcStartX} ${arcStartY} A ${radius} ${radius} 0 1 1 ${arcEndX} ${arcEndY}`;

  // Active arc (up to needle position)
  const activeEndX = cx + radius * Math.cos(valueRad);
  const activeEndY = cy + radius * Math.sin(valueRad);
  const activeSweep = progress > 50 ? 1 : 0;
  const activeAngle = (progress / 100) * totalAngle;

  const activeArcD = progress > 0
    ? `M ${arcStartX} ${arcStartY} A ${radius} ${radius} 0 ${activeSweep} 1 ${activeEndX} ${activeEndY}`
    : '';

  // Scale labels
  const scaleLabels = [
    { value: 'Undervalued', angle: startAngle + 30, cls: 'fill-emerald-600 dark:fill-emerald-400' },
    { value: 'Fair', angle: startAngle + totalAngle / 2, cls: 'fill-amber-600 dark:fill-amber-400' },
    { value: 'Overvalued', angle: endAngle - 30, cls: 'fill-red-600 dark:fill-red-400' },
  ];

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 200 140" className="w-full max-w-[280px]">
        {/* Background arc */}
        <path
          d={arcD}
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Gradient active arc */}
        {activeArcD && (
          <path
            d={activeArcD}
            fill="none"
            stroke={colors.fill}
            strokeWidth="12"
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${colors.fill}40)`,
              transition: animated ? 'd 1.2s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
            }}
          />
        )}

        {/* Scale labels */}
        {scaleLabels.map((label, i) => {
          const rad = (label.angle * Math.PI) / 180;
          const lx = cx + (radius + 20) * Math.cos(rad);
          const ly = cy + (radius + 20) * Math.sin(rad);
          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className={`text-[8px] font-medium ${label.cls}`}
            >
              {label.value}
            </text>
          );
        })}

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke={colors.stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            transition: animated ? 'all 1.2s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          }}
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="6" fill={colors.stroke} opacity="0.2" />
        <circle cx={cx} cy={cy} r="3" fill={colors.stroke} />
      </svg>

      {/* Price & Fair Value Labels */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Price</p>
            <p className="text-lg font-bold font-mono tabular-nums">
              {fmtCurrency(currentPrice)}
            </p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fair Value</p>
            <p className="text-lg font-bold font-mono tabular-nums">
              {fairValue > 0 ? fmtCurrency(fairValue) : 'N/A'}
            </p>
          </div>
        </div>

        {/* Upside / Status */}
        <div className="flex items-center justify-center gap-2">
          {status !== 'N/A' && (
            <>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.label}`}>
                {status}
              </span>
              {upside !== 0 && (
                <span className={`text-sm font-semibold font-mono tabular-nums ${pnlColor(upside)}`}>
                  {fmtPercent(upside)}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────

function GaugeSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <Skeleton className="w-[200px] h-[120px] rounded-full" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-px" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Skeleton className="h-5 w-24 rounded-full" />
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────

export default function FairValueGauge(props: FairValueGaugeProps) {
  if (props.currentPrice === 0 && props.fairValue === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground">No pricing data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4 px-6">
        {props.currentPrice === 0 ? (
          <GaugeSkeleton />
        ) : (
          <GaugeSVG {...props} animated={props.animated !== false} />
        )}
      </CardContent>
    </Card>
  );
}
