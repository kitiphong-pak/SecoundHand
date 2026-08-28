import type { OrderStatus } from "@/types";
import type { Badge } from "@/components/ui/Badge";

type BadgeStatus = Parameters<typeof Badge>[0]["status"];

export const ORDER_STATUS_LABEL: Record<OrderStatus, { label: string; status: BadgeStatus }> = {
  pending_payment: { label: "รอชำระเงิน", status: "pending" },
  paid: { label: "ชำระเงินแล้ว รอส่งมอบ", status: "info" },
  awaiting_buyer_confirmation: { label: "รอผู้ซื้อยืนยันรับสินค้า", status: "info" },
  awaiting_otp_entry: { label: "รอผู้ขายกรอก OTP", status: "info" },
  completed: { label: "ปิดการซื้อขายแล้ว", status: "success" },
  disputed: { label: "มีข้อพิพาท", status: "error" },
  cancelled: { label: "ยกเลิก คืนเงินแล้ว (เดโม)", status: "neutral" },
};
