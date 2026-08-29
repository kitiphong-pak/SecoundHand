import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { DISPUTE_GRACE_MS } from "@/lib/orderTiming";
import { logAction } from "@/lib/auditLog";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "กรุณาระบุเหตุผล" }, { status: 400 });

  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!orderRow) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = mapOrder(orderRow);
  if (order.buyerId !== user.id) {
    return NextResponse.json({ error: "เฉพาะผู้ซื้อเท่านั้นที่เปิดข้อพิพาทได้" }, { status: 403 });
  }

  // เปิดข้อพิพาทได้ภายหลัง แม้ปิดออเดอร์ไปแล้ว แต่ต้องอยู่ในกรอบเวลาที่กำหนด
  if (order.status === "completed" && order.completedAt) {
    const elapsed = Date.now() - new Date(order.completedAt).getTime();
    if (elapsed > DISPUTE_GRACE_MS) {
      return NextResponse.json({ error: "เกินระยะเวลาที่เปิดข้อพิพาทได้แล้ว" }, { status: 410 });
    }
  } else if (order.status !== "awaiting_buyer_confirmation" && order.status !== "awaiting_otp_entry") {
    return NextResponse.json({ error: "ไม่สามารถเปิดข้อพิพาทในสถานะนี้ได้" }, { status: 409 });
  }

  const { data: updated, error } = await supabase
    .from("orders")
    .update({
      status: "disputed",
      dispute_reason: reason,
      dispute_opened_at: new Date().toISOString(),
    })
    .eq("id", id)
    // ต้องยังอยู่ในสถานะเดียวกับตอนเช็คด้านบนจริงๆ — กันเช่น cron ปิดออเดอร์ (completed) ไปแล้ว
    // ระหว่างที่ผู้ซื้อกำลังส่งฟอร์มเปิดข้อพิพาทพอดี
    .in("status", ["completed", "awaiting_buyer_confirmation", "awaiting_otp_entry"])
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      { error: "สถานะออเดอร์เปลี่ยนไปแล้ว กรุณารีเฟรชหน้า" },
      { status: 409 }
    );
  }

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "order.disputed",
    targetType: "order",
    targetId: order.id,
    metadata: { reason },
  });

  return NextResponse.json({ order: mapOrder(updated) });
}
