import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { notify } from "@/lib/notify";

function completeOrder(order: ReturnType<typeof getDb>["orders"][number]) {
  order.status = "completed";
  order.completedAt = new Date().toISOString();
  const db = getDb();
  const product = db.products.find((p) => p.id === order.productId);
  if (product) product.status = "sold";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();

  const db = getDb();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  if (order.sellerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }
  if (order.status !== "awaiting_otp_entry") {
    return NextResponse.json({ error: "ออเดอร์นี้ไม่อยู่ในสถานะที่กรอก OTP ได้" }, { status: 409 });
  }
  if (order.otpExpiresAt && new Date(order.otpExpiresAt) < new Date()) {
    return NextResponse.json({ error: "รหัส OTP หมดอายุแล้ว" }, { status: 410 });
  }
  if (code !== order.otpCode) {
    return NextResponse.json({ error: "รหัส OTP ไม่ถูกต้อง" }, { status: 400 });
  }

  completeOrder(order);

  notify(
    order.buyerId,
    "order_status",
    "ปิดการซื้อขายเรียบร้อย",
    "ขอบคุณที่ใช้บริการ อย่าลืมให้คะแนนรีวิวผู้ขายด้วยนะ",
    `/orders/${order.id}`
  );

  return NextResponse.json({ order });
}
