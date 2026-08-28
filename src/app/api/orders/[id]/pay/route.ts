import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";

// ชำระเงินแบบเดโม — จำลองผลลัพธ์สำเร็จเสมอ ไม่ตัดเงินจริง ไม่เชื่อมต่อผู้ให้บริการภายนอก
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
  if (order.status !== "pending_payment") {
    return NextResponse.json({ error: "ออเดอร์นี้ชำระเงินไปแล้ว" }, { status: 409 });
  }

  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status: "paid" })
    .eq("id", id)
    .select()
    .single();
  if (error || !updated) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "order.paid",
    targetType: "order",
    targetId: order.id,
    metadata: { amount: order.amount },
  });

  return NextResponse.json({ order: mapOrder(updated) });
}
