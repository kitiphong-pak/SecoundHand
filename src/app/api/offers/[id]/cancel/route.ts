import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOffer } from "@/lib/mappers";

// ยกเลิกข้อตกลงราคาที่ตอบรับไปแล้ว — ฝั่งไหนก็กดได้ เพราะยังไม่มีออเดอร์เกิดขึ้น ทั้งคู่จึงมีสิทธิ์
// เปลี่ยนใจ ตราบใดที่อีกฝ่ายได้เห็นว่าดีลล่มแล้ว (RPC ส่งข้อความแจ้งในแชทให้ด้วย)
//
// แยกเป็น route ของตัวเองแทนที่จะยัดเป็นอีก action ใน respond — คนละการกระทำ คนละคนที่มีสิทธิ์กด
// (respond = เฉพาะฝั่งที่ถูกเสนอ, cancel = ทั้งสองฝั่ง) และคนละสถานะตั้งต้นที่ยอมรับได้
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;

  const { data, error } = await supabase.rpc("cancel_offer_agreement", {
    p_offer_id: id,
    p_user_id: user.id,
  });
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
  if (!row) {
    return NextResponse.json(
      { error: "ข้อตกลงนี้ถูกยกเลิกไปแล้ว หรือไม่มีสิทธิ์ยกเลิก" },
      { status: 409 }
    );
  }

  return NextResponse.json({ offer: mapOffer(row) });
}
