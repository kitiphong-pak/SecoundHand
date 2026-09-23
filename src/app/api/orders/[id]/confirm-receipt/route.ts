import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { completeOrder, OrderStateConflictError } from "@/lib/orderCompletion";
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

  // ผู้ซื้อกดยืนยันแล้วจบเลย ไม่มีขั้น OTP คั่นอีก — completeOrder ทำ compare-and-swap บนสถานะเดิม
  // ให้ด้วย จึงกัน race กับ cron/simulate-timeout ที่อาจปิดออเดอร์นี้ไปก่อนแล้วพอดี
  let updated;
  try {
    updated = await completeOrder(order.id, order.productId, user, "buyer_confirmed");
  } catch (e) {
    if (e instanceof OrderStateConflictError) {
      return NextResponse.json(
        { error: "ออเดอร์นี้ไม่อยู่ในสถานะที่ยืนยันได้แล้ว กรุณารีเฟรชหน้า" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
  }

  // บันทึกเวลาที่ผู้ซื้อกดไว้ด้วย ไม่ใช่แค่ completed_at — Phase 2 ต้องใช้แยกว่าใครกดยืนยันบ้าง
  await supabase
    .from("orders")
    .update({ buyer_confirmed_at: new Date().toISOString() })
    .eq("id", order.id);

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "order.buyer_confirmed",
    targetType: "order",
    targetId: order.id,
  });

  return NextResponse.json({ order: updated });
}
