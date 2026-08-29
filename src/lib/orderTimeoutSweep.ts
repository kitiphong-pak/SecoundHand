import { supabase } from "@/lib/supabase";
import { completeOrder, OrderStateConflictError } from "@/lib/orderCompletion";
import { BUYER_CONFIRM_WINDOW_MS } from "@/lib/orderTiming";

// ผู้ใช้ระบบสำหรับแปะเป็น actor ของ audit log เมื่อ action เกิดจาก cron ไม่ใช่คนกดจริง
// (สร้างไว้แล้วใน supabase/migrations/007_system_actor.sql ด้วย id คงที่ตัวนี้)
export const SYSTEM_ACTOR = {
  id: "00000000-0000-0000-0000-000000000001",
  role: "admin",
  name: "ระบบอัตโนมัติ",
};

// กวาดปิดออเดอร์ที่เลยกำหนดเวลารอ (buyer ไม่ยืนยันรับของภายใน 3 วัน หรือ seller ไม่กรอก OTP
// ภายใน 24 ชม.) แบบ "เงียบ = ยอมรับ" ตามหลักการเดียวกับปุ่ม simulate-timeout เดโม แต่ตัวนี้ทำงาน
// อัตโนมัติจริงผ่าน /api/cron/order-timeouts — เรียกซ้ำได้ปลอดภัย (idempotent) เพราะ query กรอง
// เฉพาะ status ที่ยังค้างอยู่เท่านั้น ออเดอร์ที่ปิดไปแล้วจะไม่ถูกจับมาอีกในรอบถัดไป
export async function processOrderTimeouts(): Promise<{ completedOrderIds: string[] }> {
  const now = new Date();
  const confirmDeadline = new Date(now.getTime() - BUYER_CONFIRM_WINDOW_MS).toISOString();

  const { data: overdueConfirmations } = await supabase
    .from("orders")
    .select("id, product_id")
    .eq("status", "awaiting_buyer_confirmation")
    .lt("seller_marked_delivered_at", confirmDeadline);

  const { data: overdueOtp } = await supabase
    .from("orders")
    .select("id, product_id")
    .eq("status", "awaiting_otp_entry")
    .lt("otp_expires_at", now.toISOString());

  const overdue = [...(overdueConfirmations ?? []), ...(overdueOtp ?? [])];
  const completedOrderIds: string[] = [];
  for (const o of overdue) {
    try {
      await completeOrder(o.id, o.product_id, SYSTEM_ACTOR, "timeout");
      completedOrderIds.push(o.id);
    } catch (e) {
      // มีคำขออื่น (เช่นผู้ใช้กด verify-otp/simulate-timeout เอง) แซงไปปิดออเดอร์นี้ก่อนแล้ว
      // พอดีตอน sweep รอบนี้กำลังจะจัดการ — ไม่ใช่ error จริง ข้ามไปกวาดออเดอร์ถัดไปได้เลย
      if (e instanceof OrderStateConflictError) continue;
      throw e;
    }
  }
  return { completedOrderIds };
}
