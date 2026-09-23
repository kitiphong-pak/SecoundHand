import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct, mapOrder, mapOffer } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";
import { MAX_OPEN_RESERVATIONS_PER_BUYER } from "@/lib/orderFlowConfig";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  if (user.role === "admin") {
    return NextResponse.json({ error: "แอดมินไม่สามารถซื้อสินค้าได้" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const productId = String(body?.productId ?? "");
  const offerId = body?.offerId ? String(body.offerId) : null;

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

  // การจองไม่มีค่าใช้จ่ายและยกเลิกฟรี ถ้าไม่จำกัดจำนวน คนเดียวกดจองล็อกสินค้าทั้งหมวดไว้ได้
  // ทีละ 24 ชม. โดยไม่ตั้งใจจะซื้อจริงเลยสักชิ้น — คนขายเสียโอกาสขายฟรีๆ
  const { count: openReservations } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", user.id)
    .not("status", "in", "(completed,cancelled)");
  if ((openReservations ?? 0) >= MAX_OPEN_RESERVATIONS_PER_BUYER) {
    return NextResponse.json(
      {
        error: `จองพร้อมกันได้สูงสุด ${MAX_OPEN_RESERVATIONS_PER_BUYER} ชิ้น กรุณาปิดหรือยกเลิกรายการที่ค้างอยู่ก่อน`,
      },
      { status: 409 }
    );
  }

  // ราคาสั่งซื้อ: ปกติใช้ราคาที่ตั้งไว้ตอนลงขาย แต่ถ้ามาจากการกดซื้อหลังต่อรองราคาสำเร็จ (มี
  // offerId แนบมา) ต้องยืนยันว่าข้อเสนอนั้น "ยอมรับแล้วจริง" และเป็นของคู่นี้กับสินค้านี้จริง
  // ก่อนเชื่อราคาที่ผู้ใช้ส่งมา — ไม่งั้นใครก็ส่ง offerId ของคนอื่นมาซื้อในราคาที่ไม่ได้ตกลงได้
  let amount = product.price;
  if (offerId) {
    const { data: offerRow } = await supabase.from("offers").select("*").eq("id", offerId).maybeSingle();
    if (!offerRow) return NextResponse.json({ error: "ไม่พบข้อเสนอนี้" }, { status: 404 });
    const offer = mapOffer(offerRow);
    if (offer.productId !== product.id) {
      return NextResponse.json({ error: "ข้อเสนอนี้ไม่ตรงกับสินค้า" }, { status: 400 });
    }
    if (offer.fromUserId !== user.id && offer.toUserId !== user.id) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้ข้อเสนอนี้" }, { status: 403 });
    }
    if (offer.status !== "accepted") {
      return NextResponse.json({ error: "ข้อเสนอนี้ยังไม่ได้รับการยอมรับ" }, { status: 409 });
    }
    amount = offer.amount;
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
      status: "reserved",
      amount,
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
