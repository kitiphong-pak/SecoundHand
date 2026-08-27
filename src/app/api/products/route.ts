import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, nextId } from "@/lib/db";
import type { ProductCondition } from "@/types";

const CONDITIONS: ProductCondition[] = ["new", "like_new", "good", "fair"];

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

  const db = getDb();
  const product = {
    id: nextId("p"),
    sellerId: user.id,
    title,
    description,
    price,
    category,
    condition,
    province: user.province, // สินค้าใช้จังหวัดเดียวกับผู้ขายเสมอ
    images: [] as string[],
    status: "listed" as const,
    createdAt: new Date().toISOString(),
  };
  db.products.unshift(product);

  return NextResponse.json({ product }, { status: 201 });
}
