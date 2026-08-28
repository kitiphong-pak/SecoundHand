"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

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
    <header className="border-b border-neutral-200 bg-neutral-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-6">
          <span className="font-[var(--font-display)] text-lg font-semibold text-white">
            SecoundHand <span className="text-neutral-400">· ผู้ดูแลระบบ</span>
          </span>
          <nav className="flex items-center gap-4 text-sm text-neutral-300">
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
          <span className="hidden text-sm text-neutral-300 sm:inline">{user.name}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
