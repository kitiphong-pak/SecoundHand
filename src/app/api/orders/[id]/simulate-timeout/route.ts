import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { completeOrder } from "@/lib/orderCompletion";

// เดโมเท่านั้น: จำลองว่าเวลาผ่านไปจนครบกำหนด แล้ว "เงียบ = ยอมรับ" ตามหลักการที่ออกแบบไว้
// เพื่อให้ทดสอบ flow auto-complete ได้โดยไม่ต้องรอ 3 วัน/24 ชม. จริง
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!orderRow) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = mapOrder(orderRow);
  if (order.buyerId !== user.id && order.sellerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }

  if (order.status === "awaiting_buyer_confirmation") {
    // เกินกำหนดไม่ตอบสนอง → ระบบยืนยันแทนอัตโนมัติ → ข้ามไปปิดการซื้อขายทันที
    const updated = await completeOrder(order.id, order.productId);
    return NextResponse.json({ order: updated });
  } else if (order.status === "awaiting_otp_entry") {
    // เกิน 24 ชม. ผู้ขายไม่กรอก OTP → ระบบปิดอัตโนมัติแทน (ผู้ซื้อยืนยันไปแล้วตั้งแต่ก่อนหน้า)
    const updated = await completeOrder(order.id, order.productId);
    return NextResponse.json({ order: updated });
  } else {
    return NextResponse.json({ error: "ออเดอร์นี้ไม่อยู่ในสถานะที่รอ timeout" }, { status: 409 });
  }
}
