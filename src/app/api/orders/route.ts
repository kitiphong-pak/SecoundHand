import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, nextId } from "@/lib/db";
import { notify } from "@/lib/notify";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const productId = String(body?.productId ?? "");

  const db = getDb();
  const product = db.products.find((p) => p.id === productId);
  if (!product) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
  if (product.status !== "listed") {
    return NextResponse.json({ error: "สินค้านี้ไม่พร้อมขายแล้ว" }, { status: 409 });
  }
  if (product.sellerId === user.id) {
    return NextResponse.json({ error: "ไม่สามารถซื้อสินค้าของตัวเองได้" }, { status: 400 });
  }

  const order = {
    id: nextId("o"),
    productId: product.id,
    buyerId: user.id,
    sellerId: product.sellerId,
    status: "pending_payment" as const,
    amount: product.price,
    createdAt: new Date().toISOString(),
  };
  db.orders.push(order);
  product.status = "reserved";

  notify(
    product.sellerId,
    "interest",
    "มีคนสนใจสินค้าของคุณ",
    `${user.name} กำลังสั่งซื้อ "${product.title}"`,
    `/orders/${order.id}`
  );

  return NextResponse.json({ order }, { status: 201 });
}
