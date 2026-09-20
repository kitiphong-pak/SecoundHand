import type { ReactNode } from "react";

type BadgeStatus = "pending" | "success" | "neutral" | "error" | "info" | "verified";

const statusClasses: Record<BadgeStatus, string> = {
  pending: "bg-warning-50 text-warning-500",
  success: "bg-success-50 text-success-500",
  neutral: "bg-neutral-100 text-neutral-700",
  error: "bg-error-50 text-error-500",
  info: "bg-info-50 text-info-500",
  // แยกจาก success เพราะการยืนยันตัวตน/ความปลอดภัยใช้เขียวน้ำทะเลเสมอตามกฎข้อ 5 ของสเปกดีไซน์
  // ไม่ใช้สีเดียวกับ "สำเร็จ" ทั่วไป (ปิดการขาย, อนุมัติ ฯลฯ)
  verified: "bg-trust-surface text-trust",
};

// ป้ายสถานะห้ามสื่อความหมายด้วยสีอย่างเดียว (กฎการใช้สีข้อ 6) — ทุกสถานะเลยต้องมีไอคอนเส้นโปร่ง
// กำกับคู่กับข้อความเสมอ ไม่ใช่แค่เปลี่ยนสี
const statusIcon: Record<BadgeStatus, ReactNode> = {
  pending: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5.2" />
    </svg>
  ),
  neutral: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12h7" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5M12 15.5v.1" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.4v.1M12 11.5v4.1" />
    </svg>
  ),
  verified: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M12 3l7 3v5.2c0 4.5-3 8.4-7 9.8-4-1.4-7-5.3-7-9.8V6z" />
      <path d="M9 12.2l2 2 4-4.4" />
    </svg>
  ),
};

export function Badge({ status, children }: { status: BadgeStatus; children: ReactNode }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        statusClasses[status],
      ].join(" ")}
    >
      {statusIcon[status]}
      {children}
    </span>
  );
}
