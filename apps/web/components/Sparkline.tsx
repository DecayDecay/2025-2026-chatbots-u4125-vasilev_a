// Pure SVG sparkline — no charting library, ~zero bundle cost.
export function Sparkline({
  data,
  width = 100,
  height = 28,
  stroke = "#f97316",
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (!data.length) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / Math.max(1, data.length - 1);
  const d = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.3} />
    </svg>
  );
}
