import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "เฉพาะแอดมินเท่านั้น" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolution = String(body?.resolution ?? "");
  if (resolution !== "favor_seller" && resolution !== "favor_buyer") {
    return NextResponse.json({ error: "กรุณาระบุผลการตัดสิน" }, { status: 400 });
  }

  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!orderRow) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = mapOrder(orderRow);
  if (order.status !== "disputed") {
    return NextResponse.json({ error: "ออเดอร์นี้ไม่ได้อยู่ระหว่างข้อพิพาท" }, { status: 409 });
  }

  if (resolution === "favor_seller") {
    // ถ้าเปิดข้อพิพาทหลังปิดการขายไปแล้ว (ภายในช่วงผ่อนผัน) completedAt จะมีค่าอยู่แล้ว
    // ไม่ต้องทับเวลาเดิม — ตัดสินให้ผู้ขายแค่พาออเดอร์กลับไปสถานะ "completed" เท่านั้น
    const { data: updated, error } = await supabase
      .from("orders")
      .update({
        status: "completed",
        completed_at: order.completedAt ?? new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "disputed") // กัน admin สองคนตัดสินข้อพิพาทเดียวกันซ้อนกัน
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
    if (!updated) {
      return NextResponse.json(
        { error: "ข้อพิพาทนี้ถูกตัดสินไปแล้วโดยแอดมินคนอื่น" },
        { status: 409 }
      );
    }

    await supabase.from("products").update({ status: "sold" }).eq("id", order.productId);
    await logAction({
      actorId: user.id,
      actorRole: user.role,
      actorName: user.name,
      action: "order.resolved_favor_seller",
      targetType: "order",
      targetId: order.id,
      metadata: { disputeReason: order.disputeReason },
    });
    return NextResponse.json({ order: mapOrder(updated) });
  }

  // favor_buyer: ยกเลิกออเดอร์ คืนเงินให้ผู้ซื้อ (เดโม) แล้วเอาสินค้ากลับไปลงขายใหม่
  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "disputed") // กัน admin สองคนตัดสินข้อพิพาทเดียวกันซ้อนกัน
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      { error: "ข้อพิพาทนี้ถูกตัดสินไปแล้วโดยแอดมินคนอื่น" },
      { status: 409 }
    );
  }

  await supabase.from("products").update({ status: "listed" }).eq("id", order.productId);
  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "order.resolved_favor_buyer",
    targetType: "order",
    targetId: order.id,
    metadata: { disputeReason: order.disputeReason },
  });
  return NextResponse.json({ order: mapOrder(updated) });
}
