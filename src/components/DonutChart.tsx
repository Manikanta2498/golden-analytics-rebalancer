"use client";

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  title: string;
  centerLabel: string;
  size?: number;
}

const RADIUS = 70;
const STROKE = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({ segments, title, centerLabel, size = 180 }: Props) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);

  const arcs = visible.reduce<
    { segment: DonutSegment; dash: number; offset: number }[]
  >((acc, segment) => {
    const dash = total > 0 ? (segment.value / total) * CIRCUMFERENCE : 0;
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.dash : 0;
    acc.push({ segment, dash, offset });
    return acc;
  }, []);

  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 200 200"
          width={size}
          height={size}
          role="img"
          aria-label={`${title}: ${visible
            .map(
              (segment) =>
                `${segment.label} ${((segment.value / total) * 100).toFixed(1)}%`,
            )
            .join(", ")}`}
        >
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={STROKE}
          />
          <g transform="rotate(-90 100 100)">
            {arcs.map(({ segment, dash, offset }) => (
              <circle
                key={segment.id}
                cx="100"
                cy="100"
                r={RADIUS}
                fill="none"
                stroke={segment.color}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                strokeDashoffset={-offset}
              >
                <title>
                  {segment.label}: {((segment.value / total) * 100).toFixed(1)}%
                </title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {title}
          </span>
          <span className="text-sm font-semibold tabular-nums text-slate-900">
            {centerLabel}
          </span>
        </div>
      </div>
    </figure>
  );
}
