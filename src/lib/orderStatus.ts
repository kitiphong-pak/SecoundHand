import type { OrderStatus } from "@/types";
import type { Badge } from "@/components/ui/Badge";

type BadgeStatus = Parameters<typeof Badge>[0]["status"];
type Party = "buyer" | "seller";
type StatusBadge = { label: string; status: BadgeStatus };

// ป้ายกลางๆ สำหรับคนที่ไม่ใช่คู่ซื้อขาย เช่นหน้าผู้ดูแล หรือหน้าสินค้าที่ใครเปิดดูก็ได้
export const ORDER_STATUS_LABEL: Record<OrderStatus, StatusBadge> = {
  pending_payment: { label: "รอชำระเงิน", status: "pending" },
  paid: { label: "ชำระเงินแล้ว รอส่งมอบ", status: "info" },
  awaiting_buyer_confirmation: { label: "รอผู้ซื้อยืนยันรับสินค้า", status: "info" },
  completed: { label: "ปิดการซื้อขายแล้ว", status: "success" },
  disputed: { label: "มีข้อพิพาท", status: "error" },
  cancelled: { label: "ยกเลิก คืนเงินแล้ว (เดโม)", status: "neutral" },
};

// ป้ายที่คู่ซื้อขายเห็น — เขียนจากมุมของคนอ่าน ไม่ใช่มุมของระบบ
//
// ปัญหาของป้ายกลางคือมันบอกว่า "ระบบกำลังรออะไร" ซึ่งอ่านแล้วไม่รู้ว่าตัวเองต้องทำอะไร
// เช่น "รอผู้ขายกรอก OTP" ฝั่งผู้ซื้ออ่านแล้วนึกว่าไม่ต้องทำอะไร ทั้งที่ต้องแจ้งรหัสให้ผู้ขายก่อน
// ไม่งั้นออเดอร์ไม่มีทางเดินต่อ
//
// สีก็สื่อความหมายด้วย: pending (เหลือง) = ถึงตาคุณแล้ว, info (ฟ้า) = รออีกฝ่าย
const PARTY_LABEL: Partial<Record<OrderStatus, Record<Party, StatusBadge>>> = {
  pending_payment: {
    buyer: { label: "รอคุณชำระเงิน", status: "pending" },
    seller: { label: "รอผู้ซื้อชำระเงิน", status: "info" },
  },
  paid: {
    buyer: { label: "ชำระแล้ว รอผู้ขายส่งมอบ", status: "info" },
    seller: { label: "ชำระแล้ว รอคุณส่งมอบ", status: "pending" },
  },
  awaiting_buyer_confirmation: {
    buyer: { label: "รอคุณยืนยันรับสินค้า", status: "pending" },
    seller: { label: "รอผู้ซื้อยืนยันรับสินค้า", status: "info" },
  },
};

/** ป้ายสถานะออเดอร์ — ใส่ party ถ้าคนอ่านเป็นคู่ซื้อขาย ไม่ใส่ถ้าเป็นผู้ดูแลหรือคนนอก */
export function orderStatusBadge(status: OrderStatus, party?: Party): StatusBadge {
  if (!party) return ORDER_STATUS_LABEL[status];
  return PARTY_LABEL[status]?.[party] ?? ORDER_STATUS_LABEL[status];
}
