"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

interface Badges {
  unreadChats: number;
  paidAwaitingShipment: number;
  awaitingConfirmation: number;
}

const NAV_LINKS: Array<{ href: string; label: string; badgeKey: keyof Badges | null }> = [
  { href: "/", label: "หน้าแรก", badgeKey: null },
  { href: "/my-listings", label: "สินค้าของฉัน", badgeKey: "paidAwaitingShipment" },
  { href: "/orders", label: "ออเดอร์ของฉัน", badgeKey: "awaitingConfirmation" },
  { href: "/chat", label: "แชท", badgeKey: "unreadChats" },
];

function NavItem({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <Link href={href} className="flex flex-none items-center gap-1.5 hover:text-primary-600">
      {label}
      {count > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

export function Header({ user }: { user: PublicUser }) {
  const [badges, setBadges] = useState<Badges>({
    unreadChats: 0,
    paidAwaitingShipment: 0,
    awaitingConfirmation: 0,
  });

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/badges");
      if (res.ok) setBadges(await res.json());
    };
    // ดึงทันทีตอน mount แล้ว poll ต่อเนื่อง — pattern มาตรฐานสำหรับ polling ฝั่ง client
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-[var(--font-display)] text-lg font-semibold text-primary-600">
            SecoundHand
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-neutral-600 sm:flex">
            {NAV_LINKS.map((link) => (
              <NavItem
                key={link.href}
                href={link.href}
                label={link.label}
                count={link.badgeKey ? badges[link.badgeKey] : 0}
              />
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-neutral-500 md:inline">📍 {user.province}</span>
          <span className="hidden text-sm font-medium text-neutral-900 sm:inline">{user.name}</span>
          <LogoutButton />
        </div>
      </div>

      {/* เมนูสำหรับจอเล็ก — desktop nav ถูกซ่อนไว้ (sm:flex) เลยต้องมีแถวนี้แทน ไม่งั้นบนมือถือจะกดเข้าเมนูพวกนี้ไม่ได้เลย */}
      <nav className="flex items-center gap-4 overflow-x-auto border-t border-neutral-100 px-5 py-2 text-xs text-neutral-600 sm:hidden">
        {NAV_LINKS.map((link) => (
          <NavItem
            key={link.href}
            href={link.href}
            label={link.label}
            count={link.badgeKey ? badges[link.badgeKey] : 0}
          />
        ))}
      </nav>
    </header>
  );
}
