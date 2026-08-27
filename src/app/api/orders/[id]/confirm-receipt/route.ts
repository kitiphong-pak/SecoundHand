import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { generateOtp, SELLER_OTP_WINDOW_MS } from "@/lib/orderTiming";

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
    .select()
    .single();
  if (error || !updated) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ order: mapOrder(updated) });
}
