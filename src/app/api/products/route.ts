import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";
import { isOwnedImageUrl } from "@/lib/storage";
import type { ProductCondition } from "@/types";

const CONDITIONS: ProductCondition[] = ["new", "like_new", "good", "fair"];
const MAX_IMAGES = 5;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  if (user.role === "admin") {
    return NextResponse.json({ error: "แอดมินไม่สามารถลงขายสินค้าได้" }, { status: 403 });
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

  // ตอนนี้รับเฉพาะ URL ที่อัปโหลดผ่าน /api/upload มาก่อนแล้วเท่านั้น (เก็บใน Supabase Storage)
  // ไม่รับ data URL ตรงๆ อีกต่อไป กัน client ที่ข้ามขั้นตอน upload มายัดข้อมูลดิบใส่ record
  const rawImages = Array.isArray(body?.images) ? body.images : [];
  const images: string[] = rawImages
    .filter((img: unknown): img is string => typeof img === "string" && isOwnedImageUrl(img))
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

  const product = mapProduct(row);
  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "product.listed",
    targetType: "product",
    targetId: product.id,
    metadata: { title: product.title, price: product.price },
  });

  return NextResponse.json({ product }, { status: 201 });
}
