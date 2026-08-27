import { getDb, nextId } from "@/lib/db";
import type { NotificationType } from "@/types";

export function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  link?: string
) {
  const db = getDb();
  db.notifications.unshift({
    id: nextId("n"),
    userId,
    type,
    title,
    body,
    link,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

// ข้อความแชท: รวมเป็นแจ้งเตือนเดียวต่อบทสนทนา (ต่อ link) แทนที่จะสร้างใหม่ทุกข้อความ
// ทักมากี่ข้อความในเธรดเดียวกันก็ยังนับเป็น 1 แจ้งเตือนที่ยังไม่อ่าน จนกว่าจะกดดู
export function notifyMessage(userId: string, title: string, body: string, link: string) {
  const db = getDb();
  const existing = db.notifications.find(
    (n) => n.userId === userId && n.type === "message" && n.link === link && !n.read
  );
  if (existing) {
    existing.title = title;
    existing.body = body;
    existing.createdAt = new Date().toISOString();
    return;
  }
  notify(userId, "message", title, body, link);
}
