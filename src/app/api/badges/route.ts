import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

// จำนวนตัวเลขติดเมนู แทนกระดิ่งแจ้งเตือนแบบเดิม — คำนวณจากสถานะจริงตรงๆ ไม่ต้องมี
// notification log แยกต่างหาก:
// - แชท: จำนวน "ห้องแชท" (ไม่ใช่จำนวนข้อความ) ที่มีข้อความยังไม่อ่าน
// - สินค้าของฉัน: จำนวนออเดอร์ที่ "ผู้ซื้อชำระเงินแล้ว" รอฉันแจ้งส่งมอบ (ไม่นับตอนแค่กดสั่งซื้อ
//   แต่ยังไม่จ่ายเงิน เพราะตอนนั้นยังไม่มีอะไรให้ฉันทำ ต้องรอผู้ซื้อจ่ายก่อนถึงจะ actionable จริง)
// - ออเดอร์ของฉัน: จำนวนของที่ฉันซื้อแล้วผู้ขายส่งมอบแล้ว รอฉันไปยืนยันรับ
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const db = getDb();

  const unreadThreadKeys = new Set<string>();
  for (const m of db.messages) {
    if (m.toUserId === user.id && !m.read) {
      const otherUserId = m.fromUserId;
      unreadThreadKeys.add(`${m.productId}:${otherUserId}`);
    }
  }

  const paidAwaitingShipment = db.orders.filter(
    (o) => o.sellerId === user.id && o.status === "paid"
  ).length;

  const awaitingConfirmation = db.orders.filter(
    (o) => o.buyerId === user.id && o.status === "awaiting_buyer_confirmation"
  ).length;

  return NextResponse.json({
    unreadChats: unreadThreadKeys.size,
    paidAwaitingShipment,
    awaitingConfirmation,
  });
}
