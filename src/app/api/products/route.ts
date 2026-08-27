import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import type { ProductCondition } from "@/types";

const CONDITIONS: ProductCondition[] = ["new", "like_new", "good", "fair"];
const MAX_IMAGES = 5;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

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

  // ตอนนี้รับเฉพาะ URL ที่อัปโหลดผ่าน /api/upload มาก่อนแล้วเท่านั้น (ไฟล์แยกเก็บใน public/uploads)
  // ไม่รับ data URL ตรงๆ อีกต่อไป กัน client ที่ข้าม upload endpoint มายัดข้อมูลดิบใส่ record
  const rawImages = Array.isArray(body?.images) ? body.images : [];
  const images: string[] = rawImages
    .filter((img: unknown): img is string => typeof img === "string" && img.startsWith("/uploads/"))
    .slice(0, MAX_IMAGES);

  const { data: row, error } = await supabase
    .from("products")
    .insert({
      seller_id: user.id,
      title,
      description,
      price,
      category,
      condition,
      province: user.province, // สินค้าใช้จังหวัดเดียวกับผู้ขายเสมอ
      images,
      status: "listed",
    })
    .select()
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "สร้างประกาศไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ product: mapProduct(row) }, { status: 201 });
}
