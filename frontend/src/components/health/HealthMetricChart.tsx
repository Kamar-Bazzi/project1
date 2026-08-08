import { useId, useMemo } from "react";
import {
  healthMetricPresentation,
  type HealthMetric,
  type HealthMetricType,
} from "../../types/health";

interface HealthMetricChartProps {
  metrics: HealthMetric[];
  metricType: HealthMetricType;
}

const chartWidth = 760;
const chartHeight = 260;
const padding = { top: 22, right: 24, bottom: 38, left: 58 };

export default function HealthMetricChart({
  metrics,
  metricType,
}: HealthMetricChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const points = useMemo(
    () =>
      [...metrics]
        .sort(
          (left, right) =>
            new Date(left.measuredAt).getTime() - new Date(right.measuredAt).getTime(),
        )
        .map((metric) => ({
          metric,
          timestamp: new Date(metric.measuredAt).getTime(),
        })),
    [metrics],
  );

  if (points.length === 0) return null;

  const values = points.map(({ metric }) => metric.value);
  const rawMinimum = Math.min(...values);
  const rawMaximum = Math.max(...values);
  const valuePadding = Math.max((rawMaximum - rawMinimum) * 0.12, 1);
  const minimum = rawMinimum - valuePadding;
  const maximum = rawMaximum + valuePadding;
  const firstTime = points[0].timestamp;
  const lastTime = points[points.length - 1].timestamp;
  const timeSpan = Math.max(lastTime - firstTime, 1);
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const coordinates = points.map(({ metric, timestamp }, index) => ({
    x:
      points.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + ((timestamp - firstTime) / timeSpan) * plotWidth,
    y: padding.top + ((maximum - metric.value) / (maximum - minimum)) * plotHeight,
    index,
  }));
  const polyline = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const presentation = healthMetricPresentation[metricType];
  const unit = points[0].metric.unit;
  const decimals = presentation.decimals;

  return (
    <figure className="health-chart">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>{presentation.label} trend</title>
        <desc id={descriptionId}>
          {points.length} readings from {new Date(firstTime).toLocaleString()} to{" "}
          {new Date(lastTime).toLocaleString()}. Values range from{" "}
          {rawMinimum.toFixed(decimals)} to {rawMaximum.toFixed(decimals)} {unit}.
        </desc>

        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = padding.top + fraction * plotHeight;
          const labelValue = maximum - fraction * (maximum - minimum);
          return (
            <g key={fraction}>
              <line className="health-chart-gridline" x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} />
              <text className="health-chart-axis-label" x={padding.left - 10} y={y + 4} textAnchor="end">
                {labelValue.toFixed(decimals)}
              </text>
            </g>
          );
        })}

        {coordinates.length > 1 && (
          <polyline className="health-chart-line" points={polyline} />
        )}
        {coordinates.map(({ x, y, index }) => (
          <circle
            className="health-chart-point"
            cx={x}
            cy={y}
            r={coordinates.length === 1 || index === coordinates.length - 1 ? 5 : 3}
            key={points[index].metric.id}
          />
        ))}

        <text className="health-chart-axis-label" x={padding.left} y={chartHeight - 10} textAnchor="start">
          {new Date(firstTime).toLocaleDateString([], { month: "short", day: "numeric" })}
        </text>
        <text className="health-chart-axis-label" x={chartWidth - padding.right} y={chartHeight - 10} textAnchor="end">
          {new Date(lastTime).toLocaleDateString([], { month: "short", day: "numeric" })}
        </text>
      </svg>
      <figcaption>
        {points.length} {points.length === 1 ? "reading" : "readings"}; {unit}
      </figcaption>
    </figure>
  );
}
