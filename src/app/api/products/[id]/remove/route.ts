import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const { data: productRow } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!productRow) return NextResponse.json({ error: "ไม่พบประกาศนี้" }, { status: 404 });

  const product = mapProduct(productRow);
  if (product.sellerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }
  // ลบได้เฉพาะตอนที่ยังไม่มีใครจอง/ซื้ออยู่ — ถ้ามีออเดอร์กำลังดำเนินการ (reserved) หรือขายไปแล้ว
  // (sold) การลบตรงนี้จะทำให้ buyer งงว่าประกาศหายไปไหนทั้งที่ยังมีธุรกรรมค้างอยู่
  if (product.status !== "listed") {
    return NextResponse.json(
      { error: "ลบประกาศได้เฉพาะสินค้าที่ยังไม่มีคนจอง/ซื้อเท่านั้น" },
      { status: 409 }
    );
  }

  const { data: updated, error } = await supabase
    .from("products")
    .update({ status: "removed" })
    .eq("id", id)
    .select()
    .single();
  if (error || !updated) return NextResponse.json({ error: "ลบประกาศไม่สำเร็จ" }, { status: 500 });

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "product.removed",
    targetType: "product",
    targetId: product.id,
    metadata: { title: product.title },
  });

  return NextResponse.json({ product: mapProduct(updated) });
}
