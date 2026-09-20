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

// เส้นโปร่ง stroke 1.75px ตามสเปกดีไซน์ (ห้ามปนไอคอนแบบถมทึบในชุดเดียวกัน)
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1110.7 3.2a6.7 6.7 0 009.3 11.3z" />
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
