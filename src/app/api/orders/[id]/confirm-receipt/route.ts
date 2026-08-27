import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { notify } from "@/lib/notify";
import { generateOtp, SELLER_OTP_WINDOW_MS } from "@/lib/orderTiming";

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
  if (order.buyerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }
  if (order.status !== "awaiting_buyer_confirmation") {
    return NextResponse.json({ error: "ออเดอร์นี้ไม่อยู่ในสถานะที่ยืนยันได้" }, { status: 409 });
  }

  order.status = "awaiting_otp_entry";
  order.buyerConfirmedAt = new Date().toISOString();
  order.otpCode = generateOtp();
  order.otpExpiresAt = new Date(Date.now() + SELLER_OTP_WINDOW_MS).toISOString();

  notify(
    order.sellerId,
    "order_status",
    "ผู้ซื้อยืนยันได้รับสินค้าแล้ว",
    "ขอรหัส OTP จากผู้ซื้อ แล้วกรอกเพื่อปิดการขายและรับเงิน",
    `/orders/${order.id}`
  );

  return NextResponse.json({ order });
}
