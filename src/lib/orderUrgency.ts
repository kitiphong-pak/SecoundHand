import type { OrderStatus } from "@/types";

export type UrgencyTier = "action" | "review" | "waiting" | "done";

export const URGENCY_ORDER: UrgencyTier[] = ["action", "waiting", "review", "done"];

export const URGENCY_LABEL: Record<UrgencyTier, string> = {
  action: "ต้องดำเนินการ",
  review: "รอรีวิว",
  waiting: "รอดำเนินการ",
  done: "เสร็จสิ้น",
};

// สถานะไหน "ต้องรอฝั่งไหนขยับต่อ" — ใช้จัดอันดับความเร่งด่วนของ order list ให้รายการที่
// ต้องทำก่อน (จ่ายเงิน/ยืนยันรับของ/ส่งของ/กรอก OTP) ขึ้นบนสุดเสมอ แทนที่จะเรียงตามเวลา
// ล่าสุดเฉยๆ ซึ่งทำให้รายการที่ปิดไปแล้วปนอยู่กับรายการที่ต้องรีบทำจนหาโฟกัสไม่เจอ
const ACTIONABLE_ROLE: Partial<Record<OrderStatus, "buyer" | "seller">> = {
  pending_payment: "buyer",
  paid: "seller",
  awaiting_buyer_confirmation: "buyer",
  awaiting_otp_entry: "seller",
};

export function getOrderUrgency(
  status: OrderStatus,
  role: "buyer" | "seller",
  hasReviewed: boolean
): UrgencyTier {
  if (status === "completed") return hasReviewed ? "done" : "review";
  if (status === "cancelled") return "done";
  if (status === "disputed") return "waiting"; // รออยู่ระหว่างแอดมินตรวจสอบ ไม่มีอะไรให้ทำเอง
  return ACTIONABLE_ROLE[status] === role ? "action" : "waiting";
}
