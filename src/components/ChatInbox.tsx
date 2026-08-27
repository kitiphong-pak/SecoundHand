"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Conversation {
  productId: string;
  productTitle: string;
  otherUserId: string;
  otherUserName: string;
  lastText: string;
  lastAt: string;
  unread: number;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

export function ChatInbox() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);

  const load = async () => {
    const res = await fetch("/api/chat");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations);
    }
  };

  useEffect(() => {
    // ดึงรายการแชททันทีตอน mount แล้ว poll ต่อเนื่อง — pattern มาตรฐานสำหรับ polling ฝั่ง client
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (conversations === null) {
    return <p className="mt-10 text-center text-sm text-neutral-400">กำลังโหลด...</p>;
  }

  if (conversations.length === 0) {
    return (
      <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
        ยังไม่มีบทสนทนา — ลองทักผู้ขายจากหน้ารายละเอียดสินค้าได้เลย
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-2">
      {conversations.map((c) => (
        <Link
          key={`${c.productId}:${c.otherUserId}`}
          href={`/chat/${c.productId}?with=${c.otherUserId}`}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-neutral-200 bg-white p-4 hover:shadow-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-neutral-900">{c.otherUserName}</p>
              <span className="text-xs text-neutral-400">· {c.productTitle}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-neutral-500">{c.lastText}</p>
          </div>
          <div className="flex flex-none flex-col items-end gap-1">
            <span className="text-[10px] text-neutral-400">{timeAgo(c.lastAt)}</span>
            {c.unread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white">
                {c.unread}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
