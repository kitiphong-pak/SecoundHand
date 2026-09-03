import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { completeOrder, OrderStateConflictError } from "@/lib/orderCompletion";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();

  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!orderRow) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = mapOrder(orderRow);
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

  try {
    const updated = await completeOrder(
      order.id,
      order.productId,
      { id: user.id, role: user.role, name: user.name },
      "otp"
    );
    return NextResponse.json({ order: updated });
  } catch (e) {
    if (e instanceof OrderStateConflictError) {
      // ระบบปิดออเดอร์นี้ไปแล้ว (เช่น cron timeout เข้ามาพอดี) ระหว่างที่กำลังตรวจ OTP อยู่
      return NextResponse.json(
        { error: "ออเดอร์นี้ถูกปิดไปแล้ว กรุณารีเฟรชหน้า" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "ปิดออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }
}
