// สร้าง path ของกราฟเส้นเล็ก (sparkline) แบบ SVG ล้วน — ไม่ต้องพึ่ง client-side JS หรือ
// charting library ใดๆ render ฝั่ง server ได้ตรงๆ เข้ากับสไตล์โค้ดเดิมของหน้าแอดมิน

export interface SparklineGeometry {
  width: number;
  height: number;
  linePath: string;
  areaPath: string;
  lastX: number;
  lastY: number;
}

export function buildSparkline(
  values: number[],
  opts: { width?: number; height?: number } = {}
): SparklineGeometry {
  const width = opts.width ?? 120;
  const height = opts.height ?? 32;
  const pad = 3; // เผื่อที่ให้ end-dot ไม่โดนตัดขอบ
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = height - pad - (v / max) * (height - pad * 2);
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const [firstX] = points[0];
  const areaPath = `${linePath} L${lastX.toFixed(1)},${height} L${firstX.toFixed(1)},${height} Z`;

  return { width, height, linePath, areaPath, lastX, lastY };
}

// bucket ข้อมูลรายวันย้อนหลัง `days` วัน (index 0 = เก่าสุด, ตัวสุดท้าย = วันนี้)
// ใช้ UTC ล้วนสอดคล้องกับ timestamptz ที่เก็บเป็น UTC อยู่แล้วทั้งระบบ
export function bucketDaily<T>(
  rows: T[],
  days: number,
  getDate: (row: T) => string,
  getValue: (row: T) => number = () => 1
): number[] {
  const buckets = new Array(days).fill(0) as number[];
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (const row of rows) {
    const d = new Date(getDate(row));
    const dayUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const diffDays = Math.round((todayUTC - dayUTC) / 86_400_000);
    const idx = days - 1 - diffDays;
    if (idx >= 0 && idx < days) buckets[idx] += getValue(row);
  }
  return buckets;
}
