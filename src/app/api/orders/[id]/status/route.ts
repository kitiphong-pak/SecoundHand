import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// endpoint เบาสำหรับให้หน้าออเดอร์ถามว่า "สถานะเปลี่ยนหรือยัง" โดยไม่ต้อง render หน้าใหม่ทั้งหน้า
// เดิม OrderActions เรียก router.refresh() ทุก 4 วินาที ซึ่งสั่งให้ server component ทั้งหน้าทำงาน
// ใหม่หมด (ดึงออเดอร์ + สินค้า + คู่สนทนา + รีวิว) แล้วส่ง payload กลับมา ทั้งที่ 99% ของรอบนั้น
// ไม่มีอะไรเปลี่ยนเลย ตัวนี้อ่านคอลัมน์เดียวแล้วให้ฝั่ง client ตัดสินใจเองว่าต้อง refresh ไหม
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const { data: row } = await supabase
    .from("orders")
    .select("status, buyer_id, seller_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  // คนนอกต้องไม่รู้แม้แต่สถานะของออเดอร์ที่ไม่ใช่ของตัวเอง (แอดมินดูได้ผ่านหน้าผู้ดูแล)
  const involved = row.buyer_id === user.id || row.seller_id === user.id;
  if (!involved && user.role !== "admin") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดูออเดอร์นี้" }, { status: 403 });
  }

  return NextResponse.json({ status: row.status });
}
