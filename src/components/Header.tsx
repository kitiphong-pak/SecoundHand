import Link from "next/link";
import type { User } from "@/types";
import { LogoutButton } from "@/components/LogoutButton";

export function Header({ user }: { user: User }) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-3">
      <Link href="/" className="font-[var(--font-display)] text-lg font-semibold text-primary-600">
        SecoundHand
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-neutral-500 sm:inline">📍 {user.province}</span>
        <span className="text-sm font-medium text-neutral-900">{user.name}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
