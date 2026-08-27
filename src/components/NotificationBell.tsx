"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppNotification } from "@/types";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const data = await res.json();
      setItems(data.notifications);
    }
  };

  useEffect(() => {
    // ดึงข้อมูลทันทีตอน mount แล้ว poll ต่อเนื่อง — pattern มาตรฐานสำหรับ polling ฝั่ง client
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const unreadCount = items.filter((n) => !n.read).length;

  const onSelect = async (n: AppNotification) => {
    await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
    setOpen(false);
    if (n.link) router.push(n.link);
    load();
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
        aria-label="การแจ้งเตือน"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-error-500 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-[var(--radius-lg)] border border-neutral-200 bg-white shadow-lg">
          <div className="border-b border-neutral-100 px-4 py-3 text-sm font-medium text-neutral-900">
            การแจ้งเตือน
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-400">ยังไม่มีการแจ้งเตือน</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onSelect(n)}
                  className={[
                    "block w-full border-b border-neutral-50 px-4 py-3 text-left text-sm hover:bg-neutral-50",
                    !n.read ? "bg-primary-50/40" : "",
                  ].join(" ")}
                >
                  <p className="font-medium text-neutral-900">{n.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{n.body}</p>
                  <p className="mt-1 text-[10px] text-neutral-400">{timeAgo(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
