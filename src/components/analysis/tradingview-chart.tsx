'use client';

import React, { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

interface TradingViewChartProps {
  symbol: string;
}

export default function TradingViewChart({ symbol }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous widget
    const container = containerRef.current;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (container && (window as unknown as { TradingView: { widget: (config: Record<string, unknown>) => void } }).TradingView) {
        new ((window as unknown as { TradingView: { widget: (config: Record<string, unknown>) => void } }).TradingView).widget({
          autosize: true,
          symbol: `EGX:${symbol}`,
          interval: 'D',
          timezone: 'Africa/Cairo',
          theme,
          style: '1',
          locale: 'en',
          toolbar_bg: theme === 'dark' ? '#1a1a2e' : '#f1f3f6',
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: container.id,
          hide_side_toolbar: false,
          studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [symbol, theme]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div
          id={`tv-chart-${symbol}`}
          ref={containerRef}
          className="w-full"
          style={{ height: '500px' }}
        />
      </CardContent>
    </Card>
  );
}
