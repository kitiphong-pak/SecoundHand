// กราฟแท่งแนวตั้งล้วน SVG-free (ใช้ div + flexbox ธรรมดา) — เบาและปรับตามธีมมืด/สว่างได้เอง
// ผ่าน CSS variable เหมือนกราฟอื่นๆ ในหน้าแอดมิน
export function BarChart({
  data,
  height = 160,
  color = "var(--color-primary-500)",
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <div
            className="w-full min-w-[3px] rounded-t-[3px] transition-[height]"
            style={{
              height: `${Math.max((d.value / max) * (height - 18), d.value > 0 ? 3 : 0)}px`,
              backgroundColor: color,
            }}
            title={`${d.label}: ${d.value.toLocaleString("th-TH")}`}
          />
          <span className="text-[9px] uppercase text-neutral-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
