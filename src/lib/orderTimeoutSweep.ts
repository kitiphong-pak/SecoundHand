import { supabase } from "@/lib/supabase";
import { completeOrder, OrderStateConflictError } from "@/lib/orderCompletion";
import { BUYER_CONFIRM_WINDOW_MS } from "@/lib/orderTiming";
import { RESERVATION_HOLD_MS } from "@/lib/orderFlowConfig";
import { SYSTEM_ACTOR } from "@/lib/systemUser";
import { logAction } from "@/lib/auditLog";

// งานตามเวลาของ flow ออเดอร์ ทำสองอย่าง:
//
// 1. ปิดออเดอร์ที่ผู้ขายกดส่งมอบแล้วแต่ผู้ซื้อไม่กดยืนยันภายใน 3 วัน — "เงียบ = ยอมรับ" เพราะคนที่
//    ได้ของไปแล้วมักไม่กลับมากดยืนยันในแอป ถ้าไม่ปิดให้ ออเดอร์จะค้างตลอดไปและรีวิวกันไม่ได้
// 2. ยกเลิกการจองที่ไม่มีใครขยับภายใน 24 ชม. แล้วปล่อยสินค้ากลับไปขายต่อ — การจองไม่มีค่าใช้จ่าย
//    ถ้าไม่มีตัวหมดอายุ สินค้าจะติดล็อกจากคนที่กดจองเล่นแล้วหายไป
//
// เรียกผ่าน /api/cron/order-timeouts — เรียกซ้ำได้ปลอดภัย (idempotent) เพราะทุก query กรองเฉพาะ
// ออเดอร์ที่ยังค้างอยู่ และการเขียนทุกจุดมีเงื่อนไขสถานะเดิมกำกับ (compare-and-swap)
export async function processOrderTimeouts(): Promise<{
  completedOrderIds: string[];
  expiredOrderIds: string[];
}> {
  const now = new Date();
  const confirmDeadline = new Date(now.getTime() - BUYER_CONFIRM_WINDOW_MS).toISOString();
  const reservationDeadline = new Date(now.getTime() - RESERVATION_HOLD_MS).toISOString();

  const { data: overdueConfirmations } = await supabase
    .from("orders")
    .select("id, product_id")
    .eq("status", "awaiting_buyer_confirmation")
    .lt("seller_marked_delivered_at", confirmDeadline);

  const completedOrderIds: string[] = [];
  for (const o of overdueConfirmations ?? []) {
    try {
      await completeOrder(o.id, o.product_id, SYSTEM_ACTOR, "timeout");
      completedOrderIds.push(o.id);
    } catch (e) {
      // มีคำขออื่น (เช่นผู้ซื้อกดยืนยันเอง) แซงไปปิดออเดอร์นี้ก่อนแล้วพอดีตอน sweep กำลังจะจัดการ
      // — ไม่ใช่ error จริง ข้ามไปกวาดออเดอร์ถัดไปได้เลย
      if (e instanceof OrderStateConflictError) continue;
      throw e;
    }
  }

  // ยังไม่ได้นัดกันเลยภายในเวลาที่กำหนด ถือว่าดีลไม่เกิด — ไม่แตะออเดอร์ที่นัดแล้ว (meetup_scheduled)
  // เพราะนัดอาจอยู่ไกลเกิน 24 ชม. ออกไป
  const { data: staleReservations } = await supabase
    .from("orders")
    .select("id, product_id")
    .eq("status", "reserved")
    .lt("created_at", reservationDeadline);

  const expiredOrderIds: string[] = [];
  for (const o of staleReservations ?? []) {
    const { data: cancelled } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: now.toISOString(),
        cancel_reason: "expired",
      })
      .eq("id", o.id)
      .eq("status", "reserved") // กันเขียนทับออเดอร์ที่เพิ่งขยับไปสถานะอื่นพอดี
      .select()
      .maybeSingle();
    if (!cancelled) continue;

    // ปล่อยสินค้ากลับไปขายต่อ — เงื่อนไข reserved กันไม่ให้ไปทับสินค้าที่ผู้ขายถอนหรือขายไปแล้ว
    await supabase
      .from("products")
      .update({ status: "listed" })
      .eq("id", o.product_id)
      .eq("status", "reserved");

    await logAction({
      actorId: SYSTEM_ACTOR.id,
      actorRole: SYSTEM_ACTOR.role,
      actorName: SYSTEM_ACTOR.name,
      action: "order.reservation_expired",
      targetType: "order",
      targetId: o.id,
    });
    expiredOrderIds.push(o.id);
  }

  return { completedOrderIds, expiredOrderIds };
}
