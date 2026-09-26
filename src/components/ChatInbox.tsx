"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Conversation {
  productId: string;
  productTitle: string;
  productImage: string | null;
  otherUserId: string;
  otherUserName: string;
  otherUserAvatarUrl: string | null;
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

// รายการห้องแชทแบบกะทัดรัดในคอลัมน์ซ้ายใช้เวลาสั้นกว่าเวลาแบบเต็มประโยค ("3 ชั่วโมงที่แล้ว" กินสองบรรทัด)
function shortTime(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: "sm" | "md" }) {
  const box = size === "md" ? "h-10 w-10" : "h-8 w-8";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className={`${box} flex-none rounded-full object-cover`} />;
  }
  return (
    <div
      className={`${box} flex flex-none items-center justify-center rounded-full bg-neutral-200 text-sm font-medium text-neutral-600`}
    >
      {name.trim().charAt(0)}
    </div>
  );
}

/**
 * รายการห้องแชทของผู้ใช้
 *
 * ใช้สองที่ด้วยข้อมูลชุดเดียวกัน: หน้า /chat (variant="page") และคอลัมน์ซ้ายของหน้าห้องแชทบน
 * เดสก์ท็อป (variant="sidebar") — ต่างกันแค่ความหนาแน่นของการจัดวางและการไฮไลต์ห้องที่เปิดอยู่
 */
export function ChatInbox({
  variant = "page",
  activeProductId,
  activeUserId,
}: {
  variant?: "page" | "sidebar";
  activeProductId?: string;
  activeUserId?: string;
} = {}) {
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

  const sidebar = variant === "sidebar";

  if (conversations === null) {
    return <p className="p-4 text-center text-sm text-neutral-400">กำลังโหลด...</p>;
  }

  if (conversations.length === 0) {
    return sidebar ? (
      <p className="p-4 text-center text-xs text-neutral-400">ยังไม่มีบทสนทนา</p>
    ) : (
      <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
        ยังไม่มีบทสนทนา — ลองทักผู้ขายจากหน้ารายละเอียดสินค้าได้เลย
      </div>
    );
  }

  return (
    <div className={sidebar ? "flex flex-col p-2" : "mt-5 flex flex-col gap-2"}>
      {conversations.map((c) => {
        const active = sidebar && c.productId === activeProductId && c.otherUserId === activeUserId;
        return (
          <Link
            key={`${c.productId}:${c.otherUserId}`}
            href={`/chat/${c.productId}?with=${c.otherUserId}`}
            className={
              sidebar
                ? `flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 ${
                    active ? "bg-brand-surface" : "hover:bg-neutral-50"
                  }`
                : "flex items-center gap-3 rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4 hover:shadow-sm"
            }
          >
            <Avatar
              name={c.otherUserName}
              url={c.otherUserAvatarUrl}
              size={sidebar ? "md" : "sm"}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate text-sm font-medium text-neutral-900">{c.otherUserName}</p>
                {!sidebar && <span className="text-xs text-neutral-400">· {c.productTitle}</span>}
              </div>
              {sidebar && <p className="truncate text-[11px] text-neutral-400">{c.productTitle}</p>}
              <p
                className={`mt-0.5 truncate text-xs ${
                  c.unread > 0 ? "font-medium text-neutral-900" : "text-neutral-500"
                }`}
              >
                {c.lastText}
              </p>
            </div>
            <div className="flex flex-none flex-col items-end gap-1">
              <span className="text-[10px] text-neutral-400">
                {sidebar ? shortTime(c.lastAt) : timeAgo(c.lastAt)}
              </span>
              {c.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white">
                  {c.unread}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
