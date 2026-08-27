import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

// สรุปรายการห้องแชททั้งหมดของผู้ใช้ (ทุกสินค้า) เรียงตามข้อความล่าสุด ใช้ทำหน้า inbox
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const db = getDb();
  const myMessages = db.messages.filter(
    (m) => m.fromUserId === user.id || m.toUserId === user.id
  );

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

  const conversations = [...threads.values()]
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .map((t) => {
      const product = db.products.find((p) => p.id === t.productId);
      const otherUser = db.users.find((u) => u.id === t.otherUserId);
      return {
        productId: t.productId,
        productTitle: product?.title ?? "สินค้าไม่พบ",
        otherUserId: t.otherUserId,
        otherUserName: otherUser?.name ?? "ผู้ใช้ไม่พบ",
        lastText: t.lastText,
        lastAt: t.lastAt,
        unread: t.unread,
      };
    });

  return NextResponse.json({ conversations });
}
