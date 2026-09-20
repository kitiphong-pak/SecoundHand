import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOffer } from "@/lib/mappers";

// ตอบรับ/ปฏิเสธข้อเสนอ — เฉพาะฝั่งที่ถูกเสนอ (to_user_id) เท่านั้นที่ตอบได้ และตอบได้ครั้งเดียว
// (compare-and-swap บน status="pending" อยู่ใน RPC) ยอมรับแล้วยังไม่สร้างออเดอร์ทันที แค่ปลดล็อก
// ให้ฝั่งผู้ซื้อไปกดซื้อในราคานี้เองอีกที (ดู POST /api/orders ที่รับ offerId)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const accept = Boolean(body?.accept);

  const { data, error } = await supabase.rpc("respond_offer", {
    p_offer_id: id,
    p_responder_id: user.id,
    p_accept: accept,
  });
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
  if (!row) {
    return NextResponse.json(
      { error: "ข้อเสนอนี้ถูกตอบไปแล้ว หรือไม่มีสิทธิ์ตอบ" },
      { status: 409 }
    );
  }

  return NextResponse.json({ offer: mapOffer(row) });
}
