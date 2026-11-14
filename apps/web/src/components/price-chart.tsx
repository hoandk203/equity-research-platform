'use client';
import { useEffect, useRef } from 'react';
import type { PriceBar } from '@erp/contracts';
import { movingAverage, rangeStart, type RangeId } from '../lib/chart';

export type ChartKind = 'candle' | 'line';

const COLORS = {
  up: '#2f7d4f',
  down: '#a3452f',
  line: '#124b35',
  grid: '#e6e9e1',
  text: '#5c6b62',
  bg: '#fffdf8',
  ma: { 20: '#b07d1c', 50: '#3d6fa3', 200: '#7a4b8c' } as Record<number, string>,
};

interface Props {
  bars: PriceBar[];
  kind: ChartKind;
  range: RangeId;
  maWindows: number[];
  height?: number;
}

/**
 * Financial chart (lightweight-charts): candles or close line, volume histogram on its own
 * scale, optional moving averages computed over the full history so that the first visible
 * bars already have values. The library touches `window`, so it is loaded in the browser only.
 */
export function PriceChart({ bars, kind, range, maWindows, height = 420 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const maKey = maWindows.join(',');

  useEffect(() => {
    const el = host.current;
    if (!el || bars.length === 0) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import('lightweight-charts').then(({ createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, CrosshairMode }) => {
      if (disposed) return;
      const chart = createChart(el, {
        height,
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: COLORS.bg }, textColor: COLORS.text, fontFamily: 'system-ui, sans-serif' },
        grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: COLORS.grid, scaleMargins: { top: 0.08, bottom: 0.28 } },
        timeScale: { borderColor: COLORS.grid },
        localization: { locale: 'vi-VN', priceFormatter: (p: number) => new Intl.NumberFormat('vi-VN').format(Math.round(p)) },
      });
      if (kind === 'candle') {
        const s = chart.addSeries(CandlestickSeries, {
          upColor: COLORS.up, downColor: COLORS.down, borderUpColor: COLORS.up, borderDownColor: COLORS.down,
          wickUpColor: COLORS.up, wickDownColor: COLORS.down,
        });
        s.setData(bars.map((b) => ({ time: b.date, open: b.open ?? b.close, high: b.high ?? b.close, low: b.low ?? b.close, close: b.close })));
      } else {
        const s = chart.addSeries(LineSeries, { color: COLORS.line, lineWidth: 2 });
        s.setData(bars.map((b) => ({ time: b.date, value: b.close })));
      }
      for (const w of maKey ? maKey.split(',').map(Number) : []) {
        const s = chart.addSeries(LineSeries, { color: COLORS.ma[w] ?? COLORS.text, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(movingAverage(bars, w));
      }
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
      vol.setData(bars.map((b, i) => ({
        time: b.date, value: b.volume ?? 0,
        color: i > 0 && b.close < bars[i - 1].close ? 'rgba(163,69,47,0.45)' : 'rgba(47,125,79,0.45)',
      })));
      const last = bars[bars.length - 1].date;
      const from = rangeStart(last, range);
      if (from && from > bars[0].date) chart.timeScale().setVisibleRange({ from, to: last });
      else chart.timeScale().fitContent();
      cleanup = () => chart.remove();
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [bars, kind, range, maKey, height]);

  return <div ref={host} className="price-chart" style={{ height }} data-testid="price-chart" role="img" aria-label="Biểu đồ giá và khối lượng" />;
}
