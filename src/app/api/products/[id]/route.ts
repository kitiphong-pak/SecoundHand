import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";
import { isOwnedImageUrl } from "@/lib/storage";
import type { ProductCondition } from "@/types";

const CONDITIONS: ProductCondition[] = ["new", "like_new", "good", "fair"];
const MAX_IMAGES = 5;

export async function PATCH(
  req: Request,
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
  // แก้ไขได้เฉพาะตอนที่ยังไม่มีใครจอง/ซื้ออยู่ — เหตุผลเดียวกับข้อจำกัดของการลบประกาศ
  // (ถ้ามีคนกำลังทำธุรกรรมอยู่ การเปลี่ยนราคา/รายละเอียดกลางคันจะสร้างความสับสน/ไม่เป็นธรรม)
  if (product.status !== "listed") {
    return NextResponse.json(
      { error: "แก้ไขประกาศได้เฉพาะสินค้าที่ยังไม่มีคนจอง/ซื้อเท่านั้น" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();
  const price = Number(body?.price);
  const category = String(body?.category ?? "").trim();
  const condition = String(body?.condition ?? "") as ProductCondition;

  if (!title || !description || !category) {
    return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบทุกช่อง" }, { status: 400 });
  }
  if (!Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "กรุณากรอกราคาที่ถูกต้อง" }, { status: 400 });
  }
  if (!CONDITIONS.includes(condition)) {
    return NextResponse.json({ error: "กรุณาเลือกสภาพสินค้า" }, { status: 400 });
  }

  const rawImages = Array.isArray(body?.images) ? body.images : [];
  const images: string[] = rawImages
    .filter((img: unknown): img is string => typeof img === "string" && isOwnedImageUrl(img))
    .slice(0, MAX_IMAGES);

  const { data: updated, error } = await supabase
    .from("products")
    .update({ title, description, price, category, condition, images })
    .eq("id", id)
    .eq("status", "listed") // กัน request ซ้อนกับตอนที่มีคนกำลังกดซื้อพอดี (compare-and-swap)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      { error: "สินค้านี้มีคนจอง/ซื้อไปแล้วระหว่างที่กำลังแก้ไข" },
      { status: 409 }
    );
  }

  const updatedProduct = mapProduct(updated);
  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "product.updated",
    targetType: "product",
    targetId: updatedProduct.id,
    metadata: { title: updatedProduct.title, price: updatedProduct.price },
  });

  return NextResponse.json({ product: updatedProduct });
}
