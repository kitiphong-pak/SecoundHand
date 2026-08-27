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
