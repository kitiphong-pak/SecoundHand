"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { PublicUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";

export function UserMenu({
  user,
  subtitle,
  dark = false,
  supportUnread = 0,
}: {
  user: PublicUser;
  subtitle: ReactNode;
  dark?: boolean;
  supportUnread?: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // ปิดเมนูเมื่อคลิกข้างนอก หรือกด Escape — pattern มาตรฐานของ dropdown menu
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={[
          "flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-colors",
          dark ? "hover:bg-slate-800" : "hover:bg-neutral-100",
        ].join(" ")}
      >
        <span className="relative flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-primary-100 text-sm font-medium text-primary-700">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        {/* จุดแดงบนรูปโปรไฟล์เวลาแอดมินตอบกลับมา — ให้เห็นได้โดยไม่ต้องเปิดเมนูก่อน */}
        {supportUnread > 0 && (
          <span
            aria-label={`มีข้อความใหม่จากผู้ดูแล ${supportUnread} ข้อความ`}
            className="absolute left-6 top-0.5 h-2.5 w-2.5 rounded-full bg-error-500 ring-2 ring-neutral-0"
          />
        )}
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className={["text-sm font-semibold", dark ? "text-white" : "text-neutral-900"].join(" ")}>
            {user.name}
          </span>
          <span className={["flex items-center gap-1 text-xs", dark ? "text-slate-400" : "text-neutral-500"].join(" ")}>
            {subtitle}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={[
            "text-[10px] transition-transform",
            dark ? "text-slate-400" : "text-neutral-400",
            open ? "rotate-180" : "",
          ].join(" ")}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-48 rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-1.5 shadow-lg"
        >
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            โปรไฟล์ของฉัน
          </Link>
          {user.role !== "admin" && (
            <Link
              href="/support"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              ติดต่อผู้ดูแล
              {supportUnread > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white">
                  {supportUnread > 9 ? "9+" : supportUnread}
                </span>
              )}
            </Link>
          )}
          <div className="flex items-center justify-between rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm text-neutral-700">
            <span>โหมดสว่าง/มืด</span>
            <ThemeToggle />
          </div>
          <div className="mt-1 border-t border-neutral-100 pt-1">
            <LogoutButton className="w-full text-left" />
          </div>
        </div>
      )}
    </div>
  );
}
