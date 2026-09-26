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
// ต้องทำก่อน (นัดเจอ/ส่งมอบ/ยืนยันรับของ) ขึ้นบนสุดเสมอ แทนที่จะเรียงตามเวลา
// ล่าสุดเฉยๆ ซึ่งทำให้รายการที่ปิดไปแล้วปนอยู่กับรายการที่ต้องรีบทำจนหาโฟกัสไม่เจอ
// reserved/meetup_scheduled รอทั้งสองฝ่ายนัดกันเอง ไม่มีใครเป็นฝ่าย "ต้องกดปุ่ม" ชัดๆ จึงนับเป็น
// action ของทั้งคู่ ส่วน awaiting_buyer_confirmation รอผู้ซื้อกดยืนยันฝ่ายเดียว
const ACTIONABLE_ROLE: Partial<Record<OrderStatus, "buyer" | "seller" | "both">> = {
  reserved: "both",
  meetup_scheduled: "both",
  awaiting_buyer_confirmation: "buyer",
};

export function getOrderUrgency(
  status: OrderStatus,
  role: "buyer" | "seller",
  hasReviewed: boolean
): UrgencyTier {
  if (status === "completed") return hasReviewed ? "done" : "review";
  if (status === "cancelled") return "done";
  const actionable = ACTIONABLE_ROLE[status];
  return actionable === "both" || actionable === role ? "action" : "waiting";
}
