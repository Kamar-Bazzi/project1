import type { HealthTrend } from "../../types/care";

function label(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

export default function ReportSeriesChart({ trend }: { trend: HealthTrend }) {
  const width = 680;
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 36, left: 52 };
  const values = trend.series.map((point) => point.average).filter(Number.isFinite);

  if (values.length === 0) {
    return <div className="report-chart-empty">No readings in this period.</div>;
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.1, 1);
  const lower = minimum - spread * 0.12;
  const upper = maximum + spread * 0.12;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = trend.series.map((point, index) => ({
    ...point,
    x: padding.left + (trend.series.length === 1 ? plotWidth / 2 : (index / (trend.series.length - 1)) * plotWidth),
    y: padding.top + ((upper - point.average) / (upper - lower)) * plotHeight,
  }));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return (
    <figure className="report-chart" aria-label={`${label(trend.type)} trend chart`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <title>{label(trend.type)} trend</title>
        {[0, 0.5, 1].map((ratio) => {
          const y = padding.top + ratio * plotHeight;
          const value = upper - ratio * (upper - lower);
          return <g key={ratio}><line className="report-chart-gridline" x1={padding.left} x2={width - padding.right} y1={y} y2={y} /><text className="report-chart-label" x={padding.left - 8} y={y + 4} textAnchor="end">{value.toFixed(Math.abs(value) < 10 ? 1 : 0)}</text></g>;
        })}
        <polyline className="report-chart-line" points={polyline} />
        {points.map((point, index) => <circle key={`${point.date}:${index}`} className="report-chart-point" cx={point.x} cy={point.y} r="4"><title>{new Date(point.date).toLocaleDateString()}: {point.average} {trend.unit}</title></circle>)}
        {labelIndexes.map((index) => <text key={index} className="report-chart-label" x={points[index].x} y={height - 10} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{new Date(points[index].date).toLocaleDateString([], { month: "short", day: "numeric" })}</text>)}
      </svg>
      <figcaption>{label(trend.type)} daily averages ({trend.unit})</figcaption>
    </figure>
  );
}
