import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { notify } from "@/lib/notify";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  if (order.sellerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }
  if (order.status !== "paid") {
    return NextResponse.json({ error: "ออเดอร์นี้ยังไม่พร้อมแจ้งส่งมอบ" }, { status: 409 });
  }

  order.status = "awaiting_buyer_confirmation";
  order.sellerMarkedDeliveredAt = new Date().toISOString();

  notify(
    order.buyerId,
    "order_status",
    "ผู้ขายแจ้งส่งมอบสินค้าแล้ว",
    "กรุณายืนยันเมื่อคุณได้รับสินค้าเรียบร้อย",
    `/orders/${order.id}`
  );

  return NextResponse.json({ order });
}
