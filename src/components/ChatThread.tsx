"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, User } from "@/types";

export function ChatThread({
  productId,
  currentUserId,
  otherUser,
}: {
  productId: string;
  currentUserId: string;
  otherUser: Pick<User, "id" | "name">;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await fetch(`/api/chat/${productId}?with=${otherUser.id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
    }
  };

  useEffect(() => {
    // ดึงข้อความทันทีตอน mount แล้ว poll ต่อเนื่อง — pattern มาตรฐานสำหรับ polling ฝั่ง client
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, otherUser.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/chat/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: otherUser.id, text }),
      });
      setText("");
      load();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col rounded-[var(--radius-lg)] border border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 px-4 py-3 text-sm font-medium text-neutral-900">
        {otherUser.name}
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4" style={{ minHeight: 320, maxHeight: 480 }}>
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-400">เริ่มทักทายกันได้เลย</p>
        ) : (
          messages.map((m) => {
            const mine = m.fromUserId === currentUserId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={[
                    "max-w-[75%] rounded-[var(--radius-md)] px-3.5 py-2 text-sm",
                    mine ? "bg-primary-500 text-white" : "bg-neutral-100 text-neutral-900",
                  ].join(" ")}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSend} className="flex items-center gap-2 border-t border-neutral-100 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="พิมพ์ข้อความ..."
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
