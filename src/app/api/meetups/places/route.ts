import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/** จำนวนปุ่มลัดที่โชว์ — มากกว่านี้กินที่ในแชทและกลายเป็นรายการให้ไล่อ่านแทนที่จะเป็นทางลัด */
const MAX_PLACES = 3;

// สถานที่ที่ผู้ใช้คนนี้เคยนัดมาก่อน เอาไว้ทำปุ่มลัดในฟอร์มนัด — คนขายของมือสองมักนัดที่เดิมซ้ำๆ
// (หน้าคอนโดตัวเอง สถานีรถไฟฟ้าใกล้บ้าน) การพิมพ์ใหม่ทุกครั้งคือความรำคาญที่ตัดออกได้
//
// แยกเป็น endpoint ของตัวเอง ไม่รวมไปกับ GET /api/chat/[productId] เพราะอันนั้นถูก poll ทุก 4 วินาที
// ส่วนอันนี้ต้องใช้แค่ตอนเปิดฟอร์มนัดเท่านั้น
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { data } = await supabase
    .from("meetup_proposals")
    .select("place, created_at")
    .eq("proposed_by", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // ดึงมาเผื่อแล้วค่อยตัดซ้ำในนี้ เพราะ Postgres ทำ distinct พร้อม order by created_at ไม่ได้ตรงๆ
  const places = [...new Set((data ?? []).map((r) => (r.place as string).trim()))].slice(0, MAX_PLACES);

  return NextResponse.json({ places });
}
