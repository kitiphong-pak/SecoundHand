import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { notify } from "@/lib/notify";

// ชำระเงินแบบเดโม — จำลองผลลัพธ์สำเร็จเสมอ ไม่ตัดเงินจริง ไม่เชื่อมต่อผู้ให้บริการภายนอก
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  if (order.buyerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }
  if (order.status !== "pending_payment") {
    return NextResponse.json({ error: "ออเดอร์นี้ชำระเงินไปแล้ว" }, { status: 409 });
  }

  order.status = "paid";

  notify(
    order.sellerId,
    "order_status",
    "ได้รับการชำระเงินแล้ว",
    "ผู้ซื้อชำระเงินแล้ว กรุณาเตรียมส่งมอบสินค้า",
    `/orders/${order.id}`
  );

  return NextResponse.json({ order });
}
