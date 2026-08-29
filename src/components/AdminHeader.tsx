"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicUser } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";

const NAV_LINKS = [
  { href: "/admin", label: "ภาพรวม" },
  { href: "/admin/disputes", label: "ข้อพิพาท" },
  { href: "/admin/logs", label: "กิจกรรม" },
];

export function AdminHeader({ user }: { user: PublicUser }) {
  const [openDisputes, setOpenDisputes] = useState(0);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/badges");
      if (res.ok) {
        const data = await res.json();
        setOpenDisputes(data.openDisputes ?? 0);
      }
    };
    // ดึงทันทีตอน mount แล้ว poll ต่อเนื่อง — pattern มาตรฐานสำหรับ polling ฝั่ง client
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    // แถบนี้ตั้งใจให้เป็นสีเข้มคงที่เสมอ ไม่สลับตามธีมสว่าง/มืดของเว็บ (ใช้สี slate ตรงๆ
    // ไม่ใช้ token neutral-* ที่ผูกกับธีม) เพื่อให้เห็นชัดว่ากำลังอยู่ในโซนผู้ดูแลระบบ
    <header className="border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-6">
          <span className="font-[var(--font-display)] text-lg font-semibold text-white">
            SecoundHand <span className="text-slate-400">· ผู้ดูแลระบบ</span>
          </span>
          <nav className="flex items-center gap-4 text-sm text-slate-300">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="flex items-center gap-1.5 hover:text-white">
                {link.label}
                {link.href === "/admin/disputes" && openDisputes > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white">
                    {openDisputes > 9 ? "9+" : openDisputes}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <UserMenu user={user} subtitle="ผู้ดูแลระบบ" dark />
        </div>
      </div>
    </header>
  );
}
