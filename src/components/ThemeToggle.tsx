"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const THEME_CHANGE_EVENT = "secoundhand:theme-change";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getSnapshot(): Theme {
  const stored = window.localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : getSystemTheme();
}

// server ไม่รู้ธีมที่ผู้ใช้เคยเลือกไว้ (อยู่ใน localStorage ของ browser) เลยคืน null ไปก่อน —
// React จะเช็คซ้ำกับ getSnapshot ทันทีหลัง hydrate เสร็จให้เองอัตโนมัติ (useSyncExternalStore
// ออกแบบมาสำหรับเคสนี้โดยเฉพาะ ไม่ต้องเขียน useEffect + setState เองซึ่งจะโดน React lint เตือน
// เรื่อง cascading render)
function getServerSnapshot(): Theme | null {
  return null;
}

function subscribe(callback: () => void) {
  // ต้องรู้เมื่อธีมเปลี่ยนจาก 3 ทาง: กดสวิตช์นี้เอง (custom event), แท็บอื่นกดเปลี่ยน
  // (storage event — ไม่ยิงในแท็บที่เป็นคนเขียนเอง เลยต้องมี custom event เสริม), หรือค่า
  // prefers-color-scheme ของระบบเปลี่ยนตอนที่ผู้ใช้ยังไม่เคยเลือกเองมาก่อน (matchMedia change)
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
    mql.removeEventListener("change", callback);
  };
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
      <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a1 1 0 011 1v1.5a1 1 0 11-2 0V3a1 1 0 011-1zm0 17a1 1 0 011 1v1.5a1 1 0 11-2 0V20a1 1 0 011-1zM2 12a1 1 0 011-1h1.5a1 1 0 110 2H3a1 1 0 01-1-1zm17.5-1H21a1 1 0 110 2h-1.5a1 1 0 110-2zM4.9 4.9a1 1 0 011.4 0l1.1 1.1a1 1 0 11-1.4 1.4L4.9 6.3a1 1 0 010-1.4zm11.7 11.7a1 1 0 011.4 0l1.1 1.1a1 1 0 01-1.4 1.4l-1.1-1.1a1 1 0 010-1.4zm2.5-11.7a1 1 0 010 1.4l-1.1 1.1a1 1 0 11-1.4-1.4l1.1-1.1a1 1 0 011.4 0zM7.4 16.6a1 1 0 010 1.4l-1.1 1.1a1 1 0 01-1.4-1.4l1.1-1.1a1 1 0 011.4 0z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  );
}

// สวิตช์สลับธีม — อยู่ที่เดียวคือในเมนูรูปโปรไฟล์ (UserMenu) ไม่มีปุ่มซ้ำข้างนอกอีก
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === "dark";

  const toggle = () => {
    const next: Theme = (theme ?? getSystemTheme()) === "dark" ? "light" : "dark";
    window.localStorage.setItem("theme", next);
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggle}
      aria-label={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      title={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      className={[
        "relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors",
        isDark ? "bg-primary-500" : "bg-neutral-300",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-5 w-5 items-center justify-center rounded-full bg-neutral-0 shadow-sm transition-transform",
          isDark ? "translate-x-[22px] text-primary-600" : "translate-x-0.5 text-warning-500",
        ].join(" ")}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}
