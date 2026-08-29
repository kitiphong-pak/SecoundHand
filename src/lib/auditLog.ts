import { supabase } from "@/lib/supabase";

export type AuditAction =
  | "user.registered"
  | "product.listed"
  | "product.removed"
  | "order.created"
  | "order.paid"
  | "order.delivered"
  | "order.buyer_confirmed"
  | "order.completed"
  | "order.disputed"
  | "order.resolved_favor_seller"
  | "order.resolved_favor_buyer"
  | "order.cancelled_by_buyer"
  | "review.created";

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  "user.registered": "สมัครสมาชิกใหม่",
  "product.listed": "ลงขายสินค้า",
  "product.removed": "ลบประกาศสินค้า",
  "order.created": "สร้างออเดอร์",
  "order.paid": "ชำระเงิน",
  "order.delivered": "แจ้งส่งมอบสินค้า",
  "order.buyer_confirmed": "ยืนยันรับสินค้า",
  "order.completed": "ปิดการขาย",
  "order.disputed": "เปิดข้อพิพาท",
  "order.resolved_favor_seller": "แอดมินตัดสินให้ผู้ขาย",
  "order.resolved_favor_buyer": "แอดมินตัดสินให้ผู้ซื้อ",
  "order.cancelled_by_buyer": "ผู้ซื้อยกเลิกออเดอร์",
  "review.created": "ส่งรีวิว",
};

// บันทึกกิจกรรมสำคัญของระบบไว้ให้แอดมินตรวจสอบย้อนหลังได้ (หน้า /admin/logs)
// ตั้งใจ await ให้เสร็จก่อน route จะ return เสมอ (ไม่ fire-and-forget) เพราะ serverless
// function บางแพลตฟอร์มจะตัด process ทันทีหลัง response ส่งออกไป ถ้าไม่รอ log อาจไม่ถูกเขียนจริง
// แต่ถ้าเขียน log ไม่สำเร็จ ต้องไม่ทำให้ธุรกรรมหลักของผู้ใช้พังตามไปด้วย เลย catch เองในนี้เลย
export async function logAction(entry: {
  actorId: string;
  actorRole: string;
  actorName: string;
  action: AuditAction;
  targetType: "order" | "product" | "user";
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    actor_name: entry.actorName,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    metadata: entry.metadata ?? {},
  });
  if (error) console.error("บันทึก audit log ไม่สำเร็จ:", error);
}
