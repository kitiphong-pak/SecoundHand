import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOffer, UUID_RE } from "@/lib/mappers";

// เสนอราคาต่อรองในแชท — ต่อรองได้ทั้งสองทาง (ผู้ซื้อเสนอไปหาผู้ขาย หรือผู้ขายต่อราคากลับ)
// แต่ต้องเป็นคู่สนทนาที่ถูกต้องเสมอ: ถ้าผู้เสนอไม่ใช่เจ้าของสินค้า ปลายทางต้องเป็นเจ้าของสินค้า
// เท่านั้น (กันผู้ซื้อคนหนึ่งเสนอราคาข้ามไปหาผู้ซื้ออีกคนของสินค้าเดียวกัน)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  if (user.role === "admin") {
    return NextResponse.json({ error: "แอดมินไม่สามารถต่อรองราคาได้" }, { status: 403 });
  }

  const { productId } = await params;
  const body = await req.json().catch(() => null);
  const toUserId = String(body?.toUserId ?? "");
  const amount = Number(body?.amount);
  if (!toUserId || !UUID_RE.test(toUserId) || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "กรุณาระบุราคาที่ต้องการเสนอ" }, { status: 400 });
  }
  if (toUserId === user.id) {
    return NextResponse.json({ error: "ไม่สามารถเสนอราคาให้ตัวเองได้" }, { status: 400 });
  }

  const { data: productRow } = await supabase
    .from("products")
    .select("id, seller_id, status, price")
    .eq("id", productId)
    .maybeSingle();
  if (!productRow) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
  if (productRow.status !== "listed") {
    return NextResponse.json({ error: "สินค้านี้ไม่พร้อมต่อรองราคาแล้ว" }, { status: 409 });
  }
  if (user.id !== productRow.seller_id && toUserId !== productRow.seller_id) {
    return NextResponse.json({ error: "ผู้ซื้อเสนอราคาได้เฉพาะกับผู้ขายเท่านั้น" }, { status: 400 });
  }
  // เพดานราคาเดียวกันทั้งสองทาง — ข้อเสนอห้ามเกินราคาที่ตั้งไว้ตอนลงขาย ไม่ว่าจะเสนอจากฝั่งไหน
  if (amount > Number(productRow.price)) {
    return NextResponse.json({ error: "ราคาที่เสนอต้องไม่เกินราคาที่ตั้งไว้" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_offer", {
    p_product_id: productId,
    p_from_user_id: user.id,
    p_to_user_id: toUserId,
    p_amount: amount,
  });
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !row) return NextResponse.json({ error: "เสนอราคาไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ offer: mapOffer(row) }, { status: 201 });
}
