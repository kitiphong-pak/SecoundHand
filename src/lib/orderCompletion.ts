import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";
import type { Order } from "@/types";

// โยนออกมาเมื่อ UPDATE ไม่โดนแถวไหนเลยเพราะสถานะออเดอร์เปลี่ยนไปแล้วโดยคำขออื่นระหว่างที่เรา
// กำลังประมวลผลอยู่พอดี (เช่น cron กับ verify-otp เข้ามาปิดออเดอร์เดียวกันพร้อมกัน) — ไม่ใช่
// DB error จริง ผู้เรียกควรจับ error ชนิดนี้แยกจาก error อื่นแล้วตอบ 409 หรือข้ามไปเฉยๆ ไม่ใช่ 500
export class OrderStateConflictError extends Error {
  constructor() {
    super("ออเดอร์นี้ถูกดำเนินการไปแล้วโดยคำขออื่น");
    this.name = "OrderStateConflictError";
  }
}

// ใช้ร่วมกันระหว่าง verify-otp และ simulate-timeout/cron — ทั้งสองจุดปิดออเดอร์แบบเดียวกันทุกอย่าง
// (ปั๊ม completed + completedAt แล้วเปลี่ยนสถานะสินค้าเป็น sold) ต่างกันแค่เงื่อนไขที่นำมาถึงจุดนี้
// เงื่อนไข .in("status", ...) ใน UPDATE คือ compare-and-swap กันสองคำขอ (เช่น ผู้ซื้อกดยืนยันรับของ
// พอดีตอน cron กำลังจะ timeout ออเดอร์เดียวกัน) แข่งกันเขียนทับกันโดยไม่มีใคร error เลย
export async function completeOrder(
  orderId: string,
  productId: string,
  actor: { id: string; role: string; name: string },
  via: "otp" | "timeout"
): Promise<Order> {
  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", orderId)
    .in("status", ["awaiting_buyer_confirmation", "awaiting_otp_entry"])
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new OrderStateConflictError();

  await supabase.from("products").update({ status: "sold" }).eq("id", productId);

  await logAction({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    action: "order.completed",
    targetType: "order",
    targetId: orderId,
    metadata: { via },
  });

  return mapOrder(updated);
}
