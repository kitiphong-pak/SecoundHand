import type { OrderStatus } from "@/types";
import type { Badge } from "@/components/ui/Badge";

type BadgeStatus = Parameters<typeof Badge>[0]["status"];
type Party = "buyer" | "seller";
type StatusBadge = { label: string; status: BadgeStatus };

// ป้ายกลางๆ สำหรับคนที่ไม่ใช่คู่ซื้อขาย เช่นหน้าผู้ดูแล หรือหน้าสินค้าที่ใครเปิดดูก็ได้
export const ORDER_STATUS_LABEL: Record<OrderStatus, StatusBadge> = {
  reserved: { label: "จองแล้ว รอนัดเจอ", status: "pending" },
  meetup_scheduled: { label: "นัดเจอแล้ว", status: "info" },
  awaiting_buyer_confirmation: { label: "รอผู้ซื้อยืนยันรับสินค้า", status: "info" },
  completed: { label: "ซื้อขายสำเร็จ", status: "success" },
  cancelled: { label: "ยกเลิกแล้ว", status: "neutral" },
};

// ป้ายที่คู่ซื้อขายเห็น — เขียนจากมุมของคนอ่าน ไม่ใช่มุมของระบบ
//
// ปัญหาของป้ายกลางคือมันบอกว่า "ระบบกำลังรออะไร" ซึ่งอ่านแล้วไม่รู้ว่าตัวเองต้องทำอะไร
// เช่น "จองแล้ว รอนัดเจอ" อ่านแล้วไม่รู้ว่าต้องเป็นฝ่ายทักไปนัดเอง ไม่ใช่นั่งรอให้อีกฝ่ายทัก
//
// สีก็สื่อความหมายด้วย: pending (เหลือง) = ถึงตาคุณแล้ว, info (ฟ้า) = รออีกฝ่าย
const PARTY_LABEL: Partial<Record<OrderStatus, Record<Party, StatusBadge>>> = {
  reserved: {
    buyer: { label: "จองแล้ว — นัดวันรับของกับผู้ขาย", status: "pending" },
    seller: { label: "มีคนจอง — นัดวันส่งของกับผู้ซื้อ", status: "pending" },
  },
  meetup_scheduled: {
    buyer: { label: "นัดแล้ว รอไปรับของ", status: "info" },
    seller: { label: "นัดแล้ว รอไปส่งของ", status: "info" },
  },
  awaiting_buyer_confirmation: {
    buyer: { label: "รอคุณยืนยันว่าได้รับของแล้ว", status: "pending" },
    seller: { label: "รอผู้ซื้อยืนยันรับสินค้า", status: "info" },
  },
};

/** ป้ายสถานะออเดอร์ — ใส่ party ถ้าคนอ่านเป็นคู่ซื้อขาย ไม่ใส่ถ้าเป็นผู้ดูแลหรือคนนอก */
export function orderStatusBadge(status: OrderStatus, party?: Party): StatusBadge {
  if (!party) return ORDER_STATUS_LABEL[status];
  return PARTY_LABEL[status]?.[party] ?? ORDER_STATUS_LABEL[status];
}
