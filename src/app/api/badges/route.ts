import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// จำนวนตัวเลขติดเมนู แทนกระดิ่งแจ้งเตือนแบบเดิม — คำนวณจากสถานะจริงตรงๆ ไม่ต้องมี
// notification log แยกต่างหาก:
// - แชท: จำนวน "ห้องแชท" (ไม่ใช่จำนวนข้อความ) ที่มีข้อความยังไม่อ่าน
// - สินค้าของฉัน: จำนวนออเดอร์ที่ "ผู้ซื้อชำระเงินแล้ว" รอฉันแจ้งส่งมอบ (ไม่นับตอนแค่กดสั่งซื้อ
//   แต่ยังไม่จ่ายเงิน เพราะตอนนั้นยังไม่มีอะไรให้ฉันทำ ต้องรอผู้ซื้อจ่ายก่อนถึงจะ actionable จริง)
// - ออเดอร์ของฉัน: จำนวนของที่ฉันซื้อแล้วผู้ขายส่งมอบแล้ว รอฉันไปยืนยันรับ
// - ติดต่อผู้ดูแล: ฝั่งผู้ใช้นับข้อความใหม่จากแอดมิน / ฝั่งแอดมินนับ "ห้อง" ที่มีข้อความใหม่รอตอบ
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const isAdmin = user.role === "admin";

  const [
    { count: unreadChats },
    { count: paidAwaitingShipment },
    { count: awaitingConfirmation },
    { count: openDisputes },
    { count: unreadSupport },
    { data: openSupportRaw },
  ] = await Promise.all([
    // นับ "ห้องแชท" ที่มีข้อความยังไม่อ่านตรงๆ จาก chat_threads (มีตัวนับ unread เก็บไว้ให้
    // อยู่แล้ว) แทนที่จะดึงข้อความยังไม่อ่านทุกแถวมา dedupe เป็นห้องเองใน JS แบบเดิม
    supabase
      .from("chat_threads")
      .select("*", { count: "exact", head: true })
      .or(
        `and(seller_id.eq.${user.id},seller_unread_count.gt.0),and(buyer_id.eq.${user.id},buyer_unread_count.gt.0)`
      ),
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
    // นับข้อพิพาทที่ค้างเฉพาะแอดมิน — user ทั่วไปไม่ต้อง query ตารางนี้เลย
    isAdmin
      ? supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "disputed")
      : Promise.resolve({ count: 0 }),
    // ข้อความจากแอดมินที่ผู้ใช้คนนี้ยังไม่ได้อ่าน (แอดมินไม่ต้องนับของตัวเอง)
    isAdmin
      ? Promise.resolve({ count: 0 })
      : supabase
          .from("support_messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("from_admin", true)
          .eq("read", false),
    // จำนวนห้องติดต่อที่รอแอดมินตอบ — เฉพาะแอดมินเท่านั้นที่ต้องรู้
    isAdmin
      ? (supabase.rpc("admin_support_unread_count") as unknown as Promise<{ data: number | null }>)
      : Promise.resolve({ data: 0 }),
  ]);

  return NextResponse.json({
    unreadChats: unreadChats ?? 0,
    paidAwaitingShipment: paidAwaitingShipment ?? 0,
    awaitingConfirmation: awaitingConfirmation ?? 0,
    openDisputes: openDisputes ?? 0,
    unreadSupport: unreadSupport ?? 0,
    openSupport: Number(openSupportRaw ?? 0),
  });
}
