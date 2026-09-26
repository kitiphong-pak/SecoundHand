// โดนัทชาร์ตแบบ SVG ล้วน ไม่พึ่ง charting library — สไตล์เดียวกับ src/lib/sparkline.ts
// ที่ใช้อยู่แล้วในหน้าแอดมิน วาดด้วยเทคนิค stroke-dasharray ไล่ทีละ segment รอบวงกลม
export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  segments,
  size = 128,
  strokeWidth = 18,
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-none">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {total === 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--color-neutral-100)"
              strokeWidth={strokeWidth}
            />
          ) : (
            segments.map((seg, i) => {
              const fraction = seg.value / total;
              const dash = fraction * circumference;
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return el;
            })
          )}
        </g>
      </svg>
      <ul className="flex flex-col gap-1.5 text-xs">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-1.5 text-neutral-500">
            <span
              className="h-2 w-2 flex-none rounded-full"
              style={{ backgroundColor: seg.color }}
              aria-hidden="true"
            />
            <span className="font-medium text-neutral-700">
              {total === 0 ? 0 : Math.round((seg.value / total) * 100)}%
            </span>
            {seg.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
