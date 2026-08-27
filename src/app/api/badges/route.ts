import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

// จำนวนตัวเลขติดเมนู แทนกระดิ่งแจ้งเตือนแบบเดิม — คำนวณจากสถานะจริงตรงๆ ไม่ต้องมี
// notification log แยกต่างหาก:
// - แชท: จำนวน "ห้องแชท" (ไม่ใช่จำนวนข้อความ) ที่มีข้อความยังไม่อ่าน
// - สินค้าของฉัน: จำนวนสินค้าที่ฉันลงขายแล้วมีคนสั่งซื้อ (สถานะ reserved)
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

  const reservedListings = db.products.filter(
    (p) => p.sellerId === user.id && p.status === "reserved"
  ).length;

  const awaitingConfirmation = db.orders.filter(
    (o) => o.buyerId === user.id && o.status === "awaiting_buyer_confirmation"
  ).length;

  return NextResponse.json({
    unreadChats: unreadThreadKeys.size,
    reservedListings,
    awaitingConfirmation,
  });
}
