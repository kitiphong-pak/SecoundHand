import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct, mapOrder } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  if (user.role === "admin") {
    return NextResponse.json({ error: "แอดมินไม่สามารถซื้อสินค้าได้" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const productId = String(body?.productId ?? "");

  const { data: productRow } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();
  if (!productRow) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });

  const product = mapProduct(productRow);
  if (product.sellerId === user.id) {
    return NextResponse.json({ error: "ไม่สามารถซื้อสินค้าของตัวเองได้" }, { status: 400 });
  }

  // "จอง" สินค้าก่อนสร้างออเดอร์เสมอ โดยเขียนแบบมีเงื่อนไข status="listed" กำกับไว้ด้วย —
  // ถ้าสองคนกดซื้อพร้อมกัน มีแค่คนแรกเท่านั้นที่ UPDATE นี้จะโดนแถวจริง อีกคนจะได้ 0 แถวกลับมา
  // (ไม่ error แต่ก็ไม่ใช่ "จองสำเร็จ") ต่างจากเดิมที่เช็ค status ใน JS ก่อนแล้วค่อยเขียนทีหลัง
  // ซึ่งเปิดช่องให้ทั้งสอง request อ่านเห็น "listed" พร้อมกันแล้วสร้างออเดอร์ซ้ำได้ทั้งคู่
  const { data: reservedProduct, error: reserveError } = await supabase
    .from("products")
    .update({ status: "reserved" })
    .eq("id", product.id)
    .eq("status", "listed")
    .select()
    .maybeSingle();
  if (reserveError) {
    return NextResponse.json({ error: "สร้างออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }
  if (!reservedProduct) {
    return NextResponse.json({ error: "สินค้านี้ไม่พร้อมขายแล้ว" }, { status: 409 });
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
    // จองสินค้าไปแล้วแต่สร้างออเดอร์ไม่สำเร็จ — คืนสถานะกลับเป็น listed ไม่งั้นสินค้าจะค้าง
    // "reserved" ตลอดไปทั้งที่ไม่มีออเดอร์จริงรองรับเลย
    await supabase.from("products").update({ status: "listed" }).eq("id", product.id);
    return NextResponse.json({ error: "สร้างออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }

  const order = mapOrder(orderRow);
  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "order.created",
    targetType: "order",
    targetId: order.id,
    metadata: { amount: order.amount },
  });

  return NextResponse.json({ order }, { status: 201 });
}
