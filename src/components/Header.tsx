"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PublicUser } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { LocationPinIcon } from "@/components/ui/LocationPinIcon";
import { HomeIcon, InventoryIcon, ListIcon, ChatIcon } from "@/components/ui/NavIcons";

interface Badges {
  unreadChats: number;
  paidAwaitingShipment: number;
  awaitingConfirmation: number;
  unreadSupport: number;
}

const NAV_LINKS: Array<{
  href: string;
  label: string;
  badgeKey: keyof Badges | null;
  Icon: typeof HomeIcon;
}> = [
  { href: "/", label: "หน้าแรก", badgeKey: null, Icon: HomeIcon },
  { href: "/my-listings", label: "สินค้าของฉัน", badgeKey: "paidAwaitingShipment", Icon: InventoryIcon },
  { href: "/orders", label: "ออเดอร์ของฉัน", badgeKey: "awaitingConfirmation", Icon: ListIcon },
  { href: "/chat", label: "แชท", badgeKey: "unreadChats", Icon: ChatIcon },
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

function BottomNavItem({
  href,
  label,
  count,
  Icon,
  active,
}: {
  href: string;
  label: string;
  count: number;
  Icon: typeof HomeIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
        active ? "text-primary-600" : "text-neutral-400",
      ].join(" ")}
    >
      <Icon className="h-5 w-5" />
      {label}
      {count > 0 && (
        <span className="absolute right-[calc(50%-20px)] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

export function Header({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Badges>({
    unreadChats: 0,
    paidAwaitingShipment: 0,
    awaitingConfirmation: 0,
    unreadSupport: 0,
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
    <>
      <header className="border-b border-neutral-200 bg-neutral-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" aria-label="songtor" className="flex flex-none items-center">
              <BrandLogo className="h-7" />
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
            <UserMenu
              user={user}
              supportUnread={badges.unreadSupport}
              subtitle={
                <>
                  <LocationPinIcon /> {user.province}
                </>
              }
            />
          </div>
        </div>
      </header>

      {/* เมนูสำหรับจอเล็ก — ย้ายมาไว้เป็นแถบคงที่ด้านล่างจอแบบแอปมือถือทั่วไป แทนแถวเลื่อน
          แนวนอนใต้ header เดิม (desktop nav ในแถว header ข้างบนถูกซ่อนไว้ด้วย sm:flex อยู่แล้ว
          เลยต้องมีแถบนี้แทนให้มือถือกดเข้าเมนูพวกนี้ได้) — ระยะเว้นด้านล่างของ body (ดู
          src/app/layout.tsx) กันคอนเทนต์ของหน้าโดนแถบนี้บังอยู่แล้ว */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-200 bg-neutral-0 sm:hidden">
        {NAV_LINKS.map((link) => (
          <BottomNavItem
            key={link.href}
            href={link.href}
            label={link.label}
            count={link.badgeKey ? badges[link.badgeKey] : 0}
            Icon={link.Icon}
            active={link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)}
          />
        ))}
      </nav>
    </>
  );
}
