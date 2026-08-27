import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// จำนวนตัวเลขติดเมนู แทนกระดิ่งแจ้งเตือนแบบเดิม — คำนวณจากสถานะจริงตรงๆ ไม่ต้องมี
// notification log แยกต่างหาก:
// - แชท: จำนวน "ห้องแชท" (ไม่ใช่จำนวนข้อความ) ที่มีข้อความยังไม่อ่าน
// - สินค้าของฉัน: จำนวนออเดอร์ที่ "ผู้ซื้อชำระเงินแล้ว" รอฉันแจ้งส่งมอบ (ไม่นับตอนแค่กดสั่งซื้อ
//   แต่ยังไม่จ่ายเงิน เพราะตอนนั้นยังไม่มีอะไรให้ฉันทำ ต้องรอผู้ซื้อจ่ายก่อนถึงจะ actionable จริง)
// - ออเดอร์ของฉัน: จำนวนของที่ฉันซื้อแล้วผู้ขายส่งมอบแล้ว รอฉันไปยืนยันรับ
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const [{ data: unreadRows }, { count: paidAwaitingShipment }, { count: awaitingConfirmation }] =
    await Promise.all([
      supabase
        .from("chat_messages")
        .select("product_id, from_user_id")
        .eq("to_user_id", user.id)
        .eq("read", false),
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .eq("status", "paid"),
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("buyer_id", user.id)
        .eq("status", "awaiting_buyer_confirmation"),
    ]);

  const unreadThreadKeys = new Set(
    (unreadRows ?? []).map((r) => `${r.product_id}:${r.from_user_id}`)
  );

  return NextResponse.json({
    unreadChats: unreadThreadKeys.size,
    paidAwaitingShipment: paidAwaitingShipment ?? 0,
    awaitingConfirmation: awaitingConfirmation ?? 0,
  });
}
