import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct, mapOrder } from "@/lib/mappers";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const productId = String(body?.productId ?? "");

  const { data: productRow } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();
  if (!productRow) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });

  const product = mapProduct(productRow);
  if (product.status !== "listed") {
    return NextResponse.json({ error: "สินค้านี้ไม่พร้อมขายแล้ว" }, { status: 409 });
  }
  if (product.sellerId === user.id) {
    return NextResponse.json({ error: "ไม่สามารถซื้อสินค้าของตัวเองได้" }, { status: 400 });
  }

  const { data: orderRow, error } = await supabase
    .from("orders")
    .insert({
      product_id: product.id,
      buyer_id: user.id,
      seller_id: product.sellerId,
      status: "pending_payment",
      amount: product.price,
    })
    .select()
    .single();
  if (error || !orderRow) {
    return NextResponse.json({ error: "สร้างออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }

  await supabase.from("products").update({ status: "reserved" }).eq("id", product.id);

  return NextResponse.json({ order: mapOrder(orderRow) }, { status: 201 });
}
