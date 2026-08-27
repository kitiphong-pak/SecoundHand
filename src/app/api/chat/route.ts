import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapMessage } from "@/lib/mappers";

// สรุปรายการห้องแชททั้งหมดของผู้ใช้ (ทุกสินค้า) เรียงตามข้อความล่าสุด ใช้ทำหน้า inbox
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("chat_messages")
    .select("*")
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`);
  if (error) return NextResponse.json({ error: "โหลดแชทไม่สำเร็จ" }, { status: 500 });

  const myMessages = (rows ?? []).map(mapMessage);

  const threads = new Map<
    string,
    { productId: string; otherUserId: string; lastText: string; lastAt: string; unread: number }
  >();

  for (const m of myMessages) {
    const otherUserId = m.fromUserId === user.id ? m.toUserId : m.fromUserId;
    const key = `${m.productId}:${otherUserId}`;
    const existing = threads.get(key);
    const isUnread = m.toUserId === user.id && !m.read;

    if (!existing) {
      threads.set(key, {
        productId: m.productId,
        otherUserId,
        lastText: m.text,
        lastAt: m.createdAt,
        unread: isUnread ? 1 : 0,
      });
    } else {
      if (m.createdAt > existing.lastAt) {
        existing.lastText = m.text;
        existing.lastAt = m.createdAt;
      }
      if (isUnread) existing.unread += 1;
    }
  }

  const threadList = [...threads.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  const productIds = [...new Set(threadList.map((t) => t.productId))];
  const otherUserIds = [...new Set(threadList.map((t) => t.otherUserId))];

  const [{ data: productRows }, { data: userRows }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, title").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    otherUserIds.length > 0
      ? supabase.from("users").select("id, name").in("id", otherUserIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const titleByProduct = new Map((productRows ?? []).map((p) => [p.id, p.title]));
  const nameByUser = new Map((userRows ?? []).map((u) => [u.id, u.name]));

  const conversations = threadList.map((t) => ({
    productId: t.productId,
    productTitle: titleByProduct.get(t.productId) ?? "สินค้าไม่พบ",
    otherUserId: t.otherUserId,
    otherUserName: nameByUser.get(t.otherUserId) ?? "ผู้ใช้ไม่พบ",
    lastText: t.lastText,
    lastAt: t.lastAt,
    unread: t.unread,
  }));

  return NextResponse.json({ conversations });
}
