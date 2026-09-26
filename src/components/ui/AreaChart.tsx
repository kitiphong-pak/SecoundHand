import { buildSparkline } from "@/lib/sparkline";

// เวอร์ชันใหญ่ของ sparkline (มีป้ายกำกับแกน X ด้านล่าง) ใช้ geometry เดียวกับ
// src/lib/sparkline.ts เพื่อไม่ต้องคิดเส้นโค้งใหม่ซ้ำ
export function AreaChart({
  data,
  height = 150,
  color = "var(--color-primary-500)",
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
}) {
  const values = data.map((d) => d.value);
  const { width, height: h, linePath, areaPath, lastX, lastY } = buildSparkline(values, {
    width: 640,
    height,
  });
  // โชว์ label ห่างๆ กันแน่นเกินไปเวลาข้อมูลมีหลายจุด (เช่น 14 วัน) — เว้นให้เหลือ ~6-7 ป้าย
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none">
        <path d={areaPath} fill={color} fillOpacity={0.12} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {values.length > 0 && (
          <circle cx={lastX} cy={lastY} r={5} fill={color} stroke="var(--color-neutral-0)" strokeWidth={2.5} />
        )}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-neutral-400">
        {data.map((d, i) => (
          <span key={i} className={i % labelEvery === 0 ? "" : "invisible"}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
