import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { generateOtp, SELLER_OTP_WINDOW_MS } from "@/lib/orderTiming";
import { logAction } from "@/lib/auditLog";

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
  if (order.buyerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }
  if (order.status !== "awaiting_buyer_confirmation") {
    return NextResponse.json({ error: "ออเดอร์นี้ไม่อยู่ในสถานะที่ยืนยันได้" }, { status: 409 });
  }

  const { data: updated, error } = await supabase
    .from("orders")
    .update({
      status: "awaiting_otp_entry",
      buyer_confirmed_at: new Date().toISOString(),
      otp_code: generateOtp(),
      otp_expires_at: new Date(Date.now() + SELLER_OTP_WINDOW_MS).toISOString(),
    })
    .eq("id", id)
    // กัน race กับ cron/simulate-timeout ที่อาจปิดออเดอร์นี้ไปแล้วพอดีตอนใกล้ครบกำหนด
    // ไม่งั้นจะเผลอเขียนสถานะทับ "completed" กลับไปเป็น "awaiting_otp_entry" ได้
    .eq("status", "awaiting_buyer_confirmation")
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      { error: "ออเดอร์นี้ไม่อยู่ในสถานะที่ยืนยันได้แล้ว กรุณารีเฟรชหน้า" },
      { status: 409 }
    );
  }

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "order.buyer_confirmed",
    targetType: "order",
    targetId: order.id,
  });

  return NextResponse.json({ order: mapOrder(updated) });
}
