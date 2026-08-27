import Link from "next/link";
import type { User } from "@/types";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

export function Header({ user }: { user: User }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-[var(--font-display)] text-lg font-semibold text-primary-600">
            SecoundHand
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-neutral-600 sm:flex">
            <Link href="/" className="hover:text-primary-600">
              หน้าแรก
            </Link>
            <Link href="/sell" className="hover:text-primary-600">
              ลงขายสินค้า
            </Link>
            <Link href="/my-listings" className="hover:text-primary-600">
              สินค้าของฉัน
            </Link>
            <Link href="/orders" className="hover:text-primary-600">
              ออเดอร์ของฉัน
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-neutral-500 md:inline">📍 {user.province}</span>
          <NotificationBell />
          <span className="hidden text-sm font-medium text-neutral-900 sm:inline">{user.name}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
