import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";
import { BUYER_CONFIRM_WINDOW_MS } from "@/lib/orderTiming";
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

// โยนออกมาเมื่อมีคนสั่งปิดออเดอร์ด้วยเหตุผล "หมดเวลา" ทั้งที่ยังไม่หมดเวลาจริง — ต่างจาก
// OrderStateConflictError ที่เป็นเรื่องปกติของการแข่งกันเขียน อันนี้คือคำขอที่ไม่ควรเกิดขึ้นเลย
// (cron กรองกำหนดมาก่อนแล้ว) ถ้าเจอใน log ของ cron แปลว่าเงื่อนไขสองที่ไม่ตรงกันแล้ว ต้องไปดู
export class OrderNotDueError extends Error {
  constructor() {
    super("ออเดอร์นี้ยังไม่ถึงกำหนดปิดอัตโนมัติ");
    this.name = "OrderNotDueError";
  }
}

// ใช้ร่วมกันระหว่างผู้ซื้อกดยืนยันรับของ กับ simulate-timeout/cron — ทุกจุดปิดออเดอร์เหมือนกันหมด
// (ปั๊ม completed + completedAt แล้วเปลี่ยนสถานะสินค้าเป็น sold) ต่างกันแค่เงื่อนไขที่นำมาถึงจุดนี้
// เงื่อนไข .eq("status", ...) ใน UPDATE คือ compare-and-swap กันสองคำขอ (เช่น ผู้ซื้อกดยืนยันรับของ
// พอดีตอน cron กำลังจะ timeout ออเดอร์เดียวกัน) แข่งกันเขียนทับกันโดยไม่มีใคร error เลย
//
// via ไม่ใช่แค่ป้ายบอกเหตุผลใน log — via "timeout" ต้องผ่านกำหนด 3 วันก่อนเสมอ (ดูเงื่อนไขข้างล่าง)
export async function completeOrder(
  orderId: string,
  productId: string,
  actor: { id: string; role: string; name: string },
  via: "buyer_confirmed" | "timeout"
): Promise<Order> {
  const write = supabase
    .from("orders")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "awaiting_buyer_confirmation");

  // "เงียบ = ยอมรับ" ใช้ได้ต่อเมื่อเงียบไปครบ 3 วันจริง — เงื่อนไขนี้เคยอยู่แค่ในคิวรีที่ cron ใช้เลือก
  // ออเดอร์มากวาด ใครที่เรียก completeOrder ด้วยเหตุผล timeout ได้จึงปิดออเดอร์ก่อนกำหนดได้ทันที
  // ย้ายมาอยู่ในตัว UPDATE เอง กำหนดจึงถูกบังคับที่จุดที่เขียนจริงจุดเดียว ไม่ขึ้นกับว่าใครเป็นคนเรียก
  // (แถวที่ seller_marked_delivered_at เป็น null ไม่เข้าเงื่อนไข lt อยู่แล้ว = ยังไม่ส่งมอบก็ timeout ไม่ได้)
  const guarded =
    via === "timeout"
      ? write.lt(
          "seller_marked_delivered_at",
          new Date(Date.now() - BUYER_CONFIRM_WINDOW_MS).toISOString()
        )
      : write;

  const { data: updated, error } = await guarded.select().maybeSingle();
  if (error) throw error;
  if (!updated) {
    // UPDATE ไม่โดนแถวไหน — แยกให้ออกว่าเพราะสถานะเปลี่ยนไปแล้ว (แข่งแพ้ เรื่องปกติ) หรือเพราะ
    // ยังไม่ถึงกำหนด (มีคนพยายามปิดออเดอร์ก่อนเวลา) สองอันนี้ผู้เรียกต้องรับมือคนละแบบ
    if (via === "timeout") {
      const { data: row } = await supabase
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .maybeSingle();
      if (row?.status === "awaiting_buyer_confirmation") throw new OrderNotDueError();
    }
    throw new OrderStateConflictError();
  }

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
