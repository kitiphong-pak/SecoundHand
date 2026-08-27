import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DISPUTE_GRACE_MS } from "@/lib/orderTiming";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "กรุณาระบุเหตุผล" }, { status: 400 });

  const db = getDb();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  if (order.buyerId !== user.id) {
    return NextResponse.json({ error: "เฉพาะผู้ซื้อเท่านั้นที่เปิดข้อพิพาทได้" }, { status: 403 });
  }

  // เปิดข้อพิพาทได้ภายหลัง แม้ปิดออเดอร์ไปแล้ว แต่ต้องอยู่ในกรอบเวลาที่กำหนด
  if (order.status === "completed" && order.completedAt) {
    const elapsed = Date.now() - new Date(order.completedAt).getTime();
    if (elapsed > DISPUTE_GRACE_MS) {
      return NextResponse.json({ error: "เกินระยะเวลาที่เปิดข้อพิพาทได้แล้ว" }, { status: 410 });
    }
  } else if (order.status !== "awaiting_buyer_confirmation" && order.status !== "awaiting_otp_entry") {
    return NextResponse.json({ error: "ไม่สามารถเปิดข้อพิพาทในสถานะนี้ได้" }, { status: 409 });
  }

  order.status = "disputed";
  order.disputeReason = reason;
  order.disputeOpenedAt = new Date().toISOString();

  return NextResponse.json({ order });
}
