import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

interface ChatThreadRow {
  product_id: string;
  seller_id: string;
  buyer_id: string;
  last_message_text: string;
  last_message_at: string;
  seller_unread_count: number;
  buyer_unread_count: number;
}

// สรุปรายการห้องแชททั้งหมดของผู้ใช้ (ทุกสินค้า) เรียงตามข้อความล่าสุด ใช้ทำหน้า inbox — อ่านจาก
// chat_threads (1 แถวต่อ 1 ห้องแชทจริง) โต๊ะเดียวจบ แทนที่จะดึงข้อความทุกแถวมา group เองแบบเดิม
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { data, error } = await supabase
    .from("chat_threads")
    .select("product_id, seller_id, buyer_id, last_message_text, last_message_at, seller_unread_count, buyer_unread_count")
    .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false });
  if (error) return NextResponse.json({ error: "โหลดแชทไม่สำเร็จ" }, { status: 500 });

  const threads = (data ?? []) as ChatThreadRow[];
  const productIds = [...new Set(threads.map((t) => t.product_id))];
  const otherUserIds = [...new Set(threads.map((t) => (t.seller_id === user.id ? t.buyer_id : t.seller_id)))];

  const [{ data: productRows }, { data: userRows }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, title, images").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; title: string; images: string[] | null }[] }),
    otherUserIds.length > 0
      ? supabase.from("users").select("id, name, avatar_url").in("id", otherUserIds)
      : Promise.resolve({ data: [] as { id: string; name: string; avatar_url: string | null }[] }),
  ]);
  const productById = new Map((productRows ?? []).map((p) => [p.id, p]));
  const userById = new Map((userRows ?? []).map((u) => [u.id, u]));

  const conversations = threads.map((t) => {
    const isSeller = t.seller_id === user.id;
    const otherUserId = isSeller ? t.buyer_id : t.seller_id;
    const product = productById.get(t.product_id);
    const other = userById.get(otherUserId);
    return {
      productId: t.product_id,
      productTitle: product?.title ?? "สินค้าไม่พบ",
      // รูปสินค้ากับรูปโปรไฟล์ทำให้รายการห้องแชทกวาดตาหาได้เร็วกว่าอ่านชื่อทีละบรรทัด
      productImage: product?.images?.[0] ?? null,
      otherUserId,
      otherUserName: other?.name ?? "ผู้ใช้ไม่พบ",
      otherUserAvatarUrl: other?.avatar_url ?? null,
      lastText: t.last_message_text,
      lastAt: t.last_message_at,
      unread: isSeller ? t.seller_unread_count : t.buyer_unread_count,
    };
  });

  return NextResponse.json({ conversations });
}
