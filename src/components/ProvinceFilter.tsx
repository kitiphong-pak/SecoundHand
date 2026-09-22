"use client";

import { useRouter } from "next/navigation";
import { PROVINCES } from "@/lib/provinces";

// ใช้เฉพาะตอนยังไม่ได้เข้าสู่ระบบ — สมาชิกเห็นสินค้าในจังหวัดของตัวเองอัตโนมัติอยู่แล้ว ส่วนคนนอก
// ระบบไม่รู้ว่าอยู่จังหวัดไหน เลยให้เลือกเอง (เก็บไว้ใน URL เพื่อให้แชร์ลิงก์ที่กรองแล้วต่อได้)
export function ProvinceFilter({ value }: { value: string | null }) {
  const router = useRouter();
  return (
    <select
      aria-label="เลือกจังหวัด"
      value={value ?? ""}
      onChange={(e) => {
        const province = e.target.value;
        router.push(province ? `/?province=${encodeURIComponent(province)}` : "/");
      }}
      className="rounded-[var(--radius-md)] border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-500"
    >
      <option value="">ทุกจังหวัด</option>
      {PROVINCES.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}
