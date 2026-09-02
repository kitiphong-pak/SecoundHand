"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupportMessage } from "@/types";

// ใช้ได้ทั้งฝั่งผู้ใช้ (/support) และฝั่งแอดมิน (/admin/messages) — ต่างกันแค่ endpoint กับ
// ว่าฝั่งไหนคือ "ข้อความของเรา" สำหรับจัดตำแหน่งฟองข้อความซ้าย/ขวา
export function SupportThread({
  endpoint,
  mineIs,
  placeholder = "พิมพ์ข้อความ...",
  emptyText = "ยังไม่มีข้อความ",
}: {
  endpoint: string;
  mineIs: "admin" | "user";
  placeholder?: string;
  emptyText?: string;
}) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    };
    // ดึงทันทีตอน mount แล้ว poll ต่อเนื่อง — pattern เดียวกับ ChatThread.tsx
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [endpoint]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ส่งข้อความไม่สำเร็จ");
      setText("");
      setMessages((prev) => [...prev, data.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0">
      <div
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        style={{ minHeight: 320, maxHeight: 480 }}
      >
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-400">{emptyText}</p>
        ) : (
          messages.map((m) => {
            const mine = mineIs === "admin" ? m.fromAdmin : !m.fromAdmin;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={[
                    "max-w-[75%] rounded-[var(--radius-md)] px-3.5 py-2 text-sm",
                    mine ? "bg-primary-500 text-white" : "bg-neutral-100 text-neutral-900",
                  ].join(" ")}
                >
                  {!mine && (
                    <p className="mb-0.5 text-[10px] font-medium opacity-70">
                      {m.fromAdmin ? "ทีมผู้ดูแล" : "ผู้ใช้"}
                    </p>
                  )}
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-2 text-xs text-error-500">{error}</p>}

      <form onSubmit={onSend} className="flex items-center gap-2 border-t border-neutral-100 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-500"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-[var(--radius-md)] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:bg-neutral-200"
        >
          ส่ง
        </button>
      </form>
    </div>
  );
}
