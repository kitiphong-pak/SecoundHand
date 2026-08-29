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
  // ต้องรู้เมื่อธีมเปลี่ยนจาก 3 ทาง: กดปุ่มนี้เอง (custom event), แท็บอื่นกดเปลี่ยน
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

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next: Theme = (theme ?? getSystemTheme()) === "dark" ? "light" : "dark";
    window.localStorage.setItem("theme", next);
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      title={theme === "dark" ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      className={[
        "flex h-8 w-8 flex-none items-center justify-center rounded-full text-base transition-colors",
        className || "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
      ].join(" ")}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
