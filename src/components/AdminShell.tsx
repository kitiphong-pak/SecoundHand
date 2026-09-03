"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import type { PublicUser } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";
import {
  AnalyticsIcon,
  ShoppingBagIcon,
  MessagesIcon,
  UsersIcon,
  DisputeIcon,
  ActivityIcon,
  SettingsIcon,
  SignOutIcon,
} from "@/components/ui/AdminIcons";

interface Badges {
  openDisputes: number;
  openSupport: number;
}

interface NavLink {
  href: string;
  label: string;
  Icon: typeof AnalyticsIcon;
  badgeKey?: keyof Badges;
}

// แบ่งเมนูเป็นกลุ่มตามลักษณะงาน — กลุ่มบนคือของที่ดูประจำวัน (ภาพรวม/สินค้า/ข้อความ/ผู้ใช้)
// กลุ่มล่างคืองานกำกับดูแลที่เข้าเป็นครั้งคราว (ข้อพิพาท/บันทึกกิจกรรม)
const NAV_GROUPS: Array<{ title?: string; links: NavLink[] }> = [
  {
    links: [
      { href: "/admin", label: "ภาพรวม", Icon: AnalyticsIcon },
      { href: "/admin/products", label: "สินค้า", Icon: ShoppingBagIcon },
      { href: "/admin/messages", label: "ข้อความ", Icon: MessagesIcon, badgeKey: "openSupport" },
      { href: "/admin/users", label: "ผู้ใช้", Icon: UsersIcon },
    ],
  },
  {
    title: "กำกับดูแล",
    links: [
      { href: "/admin/disputes", label: "ข้อพิพาท", Icon: DisputeIcon, badgeKey: "openDisputes" },
      { href: "/admin/logs", label: "บันทึกกิจกรรม", Icon: ActivityIcon },
    ],
  },
];

// เมนูที่ขึ้นบนแถบล่างของจอมือถือ — เอาเฉพาะที่ใช้บ่อย เพราะพื้นที่จำกัด (บันทึกกิจกรรมกับ
// ตั้งค่ายังเข้าถึงได้จากเมนูผู้ใช้/หน้าอื่น)
const MOBILE_LINKS: NavLink[] = [
  { href: "/admin", label: "ภาพรวม", Icon: AnalyticsIcon },
  { href: "/admin/products", label: "สินค้า", Icon: ShoppingBagIcon },
  { href: "/admin/messages", label: "ข้อความ", Icon: MessagesIcon, badgeKey: "openSupport" },
  { href: "/admin/users", label: "ผู้ใช้", Icon: UsersIcon },
  { href: "/admin/disputes", label: "ข้อพิพาท", Icon: DisputeIcon, badgeKey: "openDisputes" },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function BadgeCount({ count }: { count: number }) {
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function AdminShell({ user, children }: { user: PublicUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [badges, setBadges] = useState<Badges>({ openDisputes: 0, openSupport: 0 });

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/badges");
      if (res.ok) {
        const data = await res.json();
        setBadges({ openDisputes: data.openDisputes ?? 0, openSupport: data.openSupport ?? 0 });
      }
    };
    // ดึงทันทีตอน mount แล้ว poll ต่อเนื่อง — pattern มาตรฐานสำหรับ polling ฝั่ง client
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const onLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-full flex-1">
      {/* sidebar — โซนแอดมินเดิมเคยใช้แถบสีเข้มคงที่ไม่สลับธีม ตอนนี้เปลี่ยนให้ตามธีมของเว็บ
          เต็มรูปแบบแทน (สว่าง/มืด) ตามดีไซน์อ้างอิงใหม่ — ตั้งใจ sticky + h-screen เพื่อกำหนด
          ความสูงของตัวเองตรงๆ ไม่งั้น flex row จะ stretch ให้สูงเท่าคอลัมน์เนื้อหาทางขวา
          (ซึ่งยาวกว่ามาก) จนมีช่องว่างมหาศาลก่อนถึงปุ่มตั้งค่า/ออกจากระบบด้านล่าง */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col overflow-y-auto border-r border-neutral-200 bg-neutral-0 p-5 sm:flex">
        <Link
          href="/admin"
          className="font-[var(--font-display)] text-lg font-semibold text-primary-600"
        >
          songtor
        </Link>
        <p className="mt-0.5 text-xs text-neutral-400">ผู้ดูแลระบบ</p>

        <nav className="mt-8 flex flex-col gap-5">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={groupIndex} className="flex flex-col gap-1">
              {group.title && (
                <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                  {group.title}
                </p>
              )}
              {group.links.map((link) => {
                const active = isActive(pathname, link.href);
                const count = link.badgeKey ? badges[link.badgeKey] : 0;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={[
                      "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-50 text-primary-600"
                        : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900",
                    ].join(" ")}
                  >
                    <link.Icon className="h-5 w-5 flex-none" />
                    {link.label}
                    {count > 0 && (
                      <span className="ml-auto">
                        <BadgeCount count={count} />
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-neutral-100 pt-4">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
          >
            <SettingsIcon className="h-5 w-5 flex-none" />
            ตั้งค่า
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
          >
            <SignOutIcon className="h-5 w-5 flex-none" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-0 px-5 py-3 sm:justify-end">
          <Link
            href="/admin"
            className="font-[var(--font-display)] text-lg font-semibold text-primary-600 sm:hidden"
          >
            songtor
          </Link>
          <div className="flex items-center gap-3">
            <UserMenu user={user} subtitle="ผู้ดูแลระบบ" />
          </div>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6">{children}</main>
      </div>

      {/* แถบเมนูมือถือ — sidebar ถูกซ่อนไว้ต่ำกว่า sm เลยต้องมีแถบนี้แทน ใช้ pattern เดียวกับ
          bottom tab bar ของ Header.tsx ฝั่งผู้ใช้ทั่วไป (ระยะเว้นด้านล่างของ body ที่กันเนื้อหา
          โดนบังตั้งไว้ที่ src/app/layout.tsx อยู่แล้ว ใช้ร่วมกันได้เลย) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-200 bg-neutral-0 sm:hidden">
        {MOBILE_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          const count = link.badgeKey ? badges[link.badgeKey] : 0;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
                active ? "text-primary-600" : "text-neutral-400",
              ].join(" ")}
            >
              <link.Icon className="h-5 w-5" />
              {link.label}
              {count > 0 && (
                <span className="absolute right-[calc(50%-18px)] top-1">
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white">
                    {count > 9 ? "9+" : count}
                  </span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
