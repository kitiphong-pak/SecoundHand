import Link from "next/link";
import type { User } from "@/types";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

const NAV_LINKS = [
  { href: "/", label: "หน้าแรก" },
  { href: "/sell", label: "ลงขายสินค้า" },
  { href: "/my-listings", label: "สินค้าของฉัน" },
  { href: "/orders", label: "ออเดอร์ของฉัน" },
  { href: "/chat", label: "แชท" },
];

export function Header({ user }: { user: User }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-[var(--font-display)] text-lg font-semibold text-primary-600">
            SecoundHand
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-neutral-600 sm:flex">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-primary-600">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-neutral-500 md:inline">📍 {user.province}</span>
          <NotificationBell />
          <span className="hidden text-sm font-medium text-neutral-900 sm:inline">{user.name}</span>
          <LogoutButton />
        </div>
      </div>

      {/* เมนูสำหรับจอเล็ก — desktop nav ถูกซ่อนไว้ (sm:flex) เลยต้องมีแถวนี้แทน ไม่งั้นบนมือถือจะกดเข้าเมนูพวกนี้ไม่ได้เลย */}
      <nav className="flex items-center gap-4 overflow-x-auto border-t border-neutral-100 px-5 py-2 text-xs text-neutral-600 sm:hidden">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="flex-none hover:text-primary-600">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
