"use client";
import { useEffect, useRef } from "react";
import { createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";

export interface PricePoint {
  // ISO date or full timestamp; we coerce to seconds for the chart.
  ts: string;
  price: number;
  volume: number;
}

// lightweight-charts requires unique, ascending timestamps. We dedupe by
// taking the last value for each timestamp and sort defensively.
function normalize(data: PricePoint[]) {
  const byTs = new Map<number, { price: number; volume: number }>();
  for (const d of data) {
    const sec = Math.floor(new Date(d.ts).getTime() / 1000);
    if (!Number.isFinite(sec)) continue;
    byTs.set(sec, { price: d.price, volume: d.volume });
  }
  return [...byTs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sec, v]) => ({ time: sec as UTCTimestamp, ...v }));
}

export function PriceChart({
  data,
  showVolume = false,
}: {
  data: PricePoint[];
  // Only meaningful for daily PriceHistory — intraday snapshots share a
  // 24h rolling volume across points, which isn't per-bar data.
  showVolume?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#737373",
        fontSize: 11,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.04)" },
        horzLines: { color: "rgba(255, 255, 255, 0.04)" },
      },
      height: 360,
      timeScale: {
        timeVisible: true,
        borderVisible: false,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      crosshair: {
        horzLine: { color: "#525252", labelBackgroundColor: "#171717" },
        vertLine: { color: "#525252", labelBackgroundColor: "#171717" },
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    const points = normalize(data);
    const line = chart.addLineSeries({
      color: "#f97316",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerRadius: 4,
    });
    line.setData(points.map((p) => ({ time: p.time, value: p.price })));

    if (showVolume) {
      const volume = chart.addHistogramSeries({
        color: "rgba(249, 115, 22, 0.25)",
        priceScaleId: "",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume
        .priceScale()
        .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(points.map((p) => ({ time: p.time, value: p.volume })));
    }

    chart.timeScale().fitContent();
    const el = ref.current;
    const ro = new ResizeObserver(() => {
      if (el) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  return <div ref={ref} className="w-full" />;
}
