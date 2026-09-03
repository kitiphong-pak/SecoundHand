// วงแหวนแสดงเปอร์เซ็นต์ — ใช้ stroke-dasharray แบบเดียวกับ DonutChart.tsx แต่มีแค่ segment เดียว
// และมีตัวเลขเปอร์เซ็นต์อยู่กลางวง
export function ProgressRing({
  percent,
  color = "var(--color-primary-500)",
  size = 88,
  strokeWidth = 9,
}: {
  percent: number;
  color?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-none">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-neutral-100)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-neutral-900"
        style={{ fontSize: size * 0.2, fontWeight: 600 }}
      >
        {clamped}%
      </text>
    </svg>
  );
}
