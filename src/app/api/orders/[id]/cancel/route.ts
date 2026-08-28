import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
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
    return NextResponse.json({ error: "เฉพาะผู้ซื้อเท่านั้นที่ยกเลิกออเดอร์นี้ได้" }, { status: 403 });
  }
  // ยกเลิกเองได้แค่ก่อนผู้ขายเริ่มส่งมอบ — หลังจากนั้นของอาจอยู่ระหว่างขนส่งแล้ว ให้ใช้ระบบ
  // ข้อพิพาทแทน (เปิดได้ตั้งแต่ awaiting_buyer_confirmation เป็นต้นไป)
  if (order.status !== "pending_payment" && order.status !== "paid") {
    return NextResponse.json(
      { error: "ไม่สามารถยกเลิกออเดอร์นี้ได้แล้ว (ผู้ขายเริ่มดำเนินการส่งมอบแล้ว)" },
      { status: 409 }
    );
  }

  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error || !updated) return NextResponse.json({ error: "ยกเลิกไม่สำเร็จ" }, { status: 500 });

  await supabase.from("products").update({ status: "listed" }).eq("id", order.productId);

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "order.cancelled_by_buyer",
    targetType: "order",
    targetId: order.id,
  });

  return NextResponse.json({ order: mapOrder(updated) });
}
