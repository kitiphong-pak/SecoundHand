import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { completeOrder, OrderNotDueError, OrderStateConflictError } from "@/lib/orderCompletion";
import { BUYER_CONFIRM_WINDOW_MS } from "@/lib/orderTiming";

// เดโมเท่านั้น: จำลองว่าเวลาผ่านไปจนครบกำหนด แล้ว "เงียบ = ยอมรับ" ตามหลักการที่ออกแบบไว้
// เพื่อให้ทดสอบ flow auto-complete ได้โดยไม่ต้องรอ 3 วัน/24 ชม. จริง
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ห้ามมีอยู่จริงบน production — completeOrder ไม่ได้เช็คเวลา เงื่อนไขรอ 3 วันอยู่ในคิวรีของ cron
  // เท่านั้น ใครยิง endpoint นี้ตรงๆ จึงข้ามเวลารอไปได้ทั้งก้อน กลายเป็นทางให้ผู้ขายกดส่งมอบแล้วปิด
  // ออเดอร์เองทันทีโดยผู้ซื้อไม่เคยยืนยัน (สินค้าเป็น sold, รีวิวปลดล็อก, ย้อนไม่ได้)
  // ตอบ 404 เปล่าๆ เหมือน route นี้ไม่มีอยู่ ไม่ใช่ 403 ที่บอกใบ้ว่ามีทางลับซ่อนอยู่
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!orderRow) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = mapOrder(orderRow);
  if (order.buyerId !== user.id && order.sellerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }

  if (order.status !== "awaiting_buyer_confirmation") {
    return NextResponse.json({ error: "ออเดอร์นี้ไม่อยู่ในสถานะที่รอ timeout" }, { status: 409 });
  }

  // จำลองเวลาผ่านไปด้วยการเลื่อนเวลาที่ผู้ขายกดส่งมอบให้ย้อนไปพ้นกำหนด แล้วปล่อยให้ logic จริง
  // ตัดสินใจเอง — ไม่ใช่การขอข้ามกำหนด เพราะ completeOrder บังคับกำหนด 3 วันกับทุกคนเท่ากัน
  // เงื่อนไขสถานะกำกับไว้ด้วย กันเลื่อนเวลาของออเดอร์ที่เพิ่งถูกปิดไปแล้วพอดี
  const backdated = new Date(Date.now() - BUYER_CONFIRM_WINDOW_MS - 60_000).toISOString();
  await supabase
    .from("orders")
    .update({ seller_marked_delivered_at: backdated })
    .eq("id", order.id)
    .eq("status", "awaiting_buyer_confirmation");

  try {
    // เกินกำหนดไม่ตอบสนอง → ระบบยืนยันแทนอัตโนมัติ → ข้ามไปปิดการซื้อขายทันที (ทั้งสองสถานะ
    // ใช้ logic เดียวกัน แค่คนละเหตุผลที่ทำให้ระบบตัดสินใจแทน)
    const updated = await completeOrder(
      order.id,
      order.productId,
      { id: user.id, role: user.role, name: user.name },
      "timeout"
    );
    return NextResponse.json({ order: updated });
  } catch (e) {
    if (e instanceof OrderStateConflictError) {
      return NextResponse.json(
        { error: "ออเดอร์นี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้า" },
        { status: 409 }
      );
    }
    // เลื่อนเวลาไปแล้วแต่ completeOrder ยังบอกว่าไม่ถึงกำหนด = สองที่คิดกำหนดไม่ตรงกัน ต้องเห็นชัดๆ
    if (e instanceof OrderNotDueError) {
      return NextResponse.json(
        { error: "เลื่อนเวลาส่งมอบแล้วแต่ยังไม่ถึงกำหนด — กำหนดใน completeOrder กับที่นี่ไม่ตรงกัน" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "ปิดออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }
}
