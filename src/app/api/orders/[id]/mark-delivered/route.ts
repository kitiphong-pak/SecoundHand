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
    .eq("status", "paid") // กัน request ซ้อนแจ้งส่งมอบซ้ำถ้าสถานะเปลี่ยนไปแล้ว
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ error: "ออเดอร์นี้ยังไม่พร้อมแจ้งส่งมอบ" }, { status: 409 });
  }

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "order.delivered",
    targetType: "order",
    targetId: order.id,
  });

  return NextResponse.json({ order: mapOrder(updated) });
}
