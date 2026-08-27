import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";

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
  if (order.sellerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }
  if (order.status !== "paid") {
    return NextResponse.json({ error: "ออเดอร์นี้ยังไม่พร้อมแจ้งส่งมอบ" }, { status: 409 });
  }

  const { data: updated, error } = await supabase
    .from("orders")
    .update({
      status: "awaiting_buyer_confirmation",
      seller_marked_delivered_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error || !updated) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ order: mapOrder(updated) });
}
