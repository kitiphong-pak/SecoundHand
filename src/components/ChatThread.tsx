"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage, Offer, User } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { callApi, messageOf } from "@/lib/apiResponse";

const OFFER_BADGE = {
  pending: { label: "รอตอบรับ", status: "pending" as const },
  accepted: { label: "ตกลงราคานี้แล้ว", status: "success" as const },
  declined: { label: "ปฏิเสธข้อเสนอนี้แล้ว", status: "error" as const },
  cancelled: { label: "ยกเลิกแล้ว", status: "neutral" as const },
};

function OfferBubble({
  offer,
  mine,
  isSeller,
  onRespond,
  onBuy,
  onCancelAgreement,
  loading,
}: {
  offer: Offer;
  mine: boolean;
  isSeller: boolean;
  onRespond: (accept: boolean) => void;
  onBuy: () => void;
  onCancelAgreement: () => void;
  loading: boolean;
}) {
  const badge = OFFER_BADGE[offer.status];
  // ฝั่งที่ถูกเสนอ (ไม่ใช่คนส่ง) เท่านั้นที่ตอบรับ/ปฏิเสธได้ — mine บอกว่าเราเป็นคนส่งข้อเสนอนี้ไหม
  const canRespond = !mine && offer.status === "pending";
  // ยอมรับแล้วต้องให้ "ผู้ซื้อ" เป็นคนกดซื้อเองเท่านั้น ไม่ว่าใครจะเป็นคนกดยอมรับข้อเสนอก็ตาม
  const canBuy = offer.status === "accepted" && !isSeller;

  return (
    <div
      className={[
        "max-w-[80%] rounded-[var(--radius-md)] border border-border bg-surface-card px-3.5 py-3 text-sm",
        mine ? "self-end" : "self-start",
      ].join(" ")}
    >
      <p className="text-xs text-neutral-500">เสนอราคา</p>
      <p className="mt-0.5 text-lg font-bold tracking-[-0.01em] text-price">
        ฿{offer.amount.toLocaleString("th-TH")}
      </p>
      <div className="mt-2">
        <Badge status={badge.status}>{badge.label}</Badge>
      </div>
      {canRespond && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" disabled={loading} onClick={() => onRespond(true)}>
            ยอมรับ
          </Button>
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => onRespond(false)}>
            ปฏิเสธ
          </Button>
        </div>
      )}
      {canBuy && (
        <div className="mt-3">
          <Button size="sm" variant="primary" disabled={loading} onClick={onBuy}>
            ซื้อในราคานี้ ฿{offer.amount.toLocaleString("th-TH")}
          </Button>
        </div>
      )}
      {offer.status === "accepted" && isSeller && (
        <p className="mt-2 text-xs text-neutral-500">รอผู้ซื้อกดซื้อในราคานี้</p>
      )}
      {/* ยกเลิกได้ทั้งสองฝ่าย เพราะยังไม่มีออเดอร์เกิดขึ้น ทั้งคู่จึงยังเปลี่ยนใจได้ และนี่คือ
          ทางเดียวที่จะกลับไปต่อรองราคาใหม่ได้ หลังตกลงกันแล้วปุ่มเสนอราคาจะถูกล็อกไว้ */}
      {offer.status === "accepted" && (
        <button
          type="button"
          disabled={loading}
          onClick={onCancelAgreement}
          className="mt-2 text-xs text-neutral-400 underline disabled:opacity-50"
        >
          ยกเลิกข้อตกลง
        </button>
      )}
    </div>
  );
}

export function ChatThread({
  productId,
  currentUserId,
  otherUser,
  productPrice,
  isSeller,
  canNegotiate,
}: {
  productId: string;
  currentUserId: string;
  otherUser: Pick<User, "id" | "name">;
  productPrice: number;
  isSeller: boolean;
  canNegotiate: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerError, setOfferError] = useState("");
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await fetch(`/api/chat/${productId}?with=${otherUser.id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
      setOffers(data.offers ?? []);
    }
  };

  useEffect(() => {
    // ดึงทันทีตอน mount แล้ว poll ต่อเนื่อง — pattern มาตรฐานสำหรับ polling ฝั่ง client
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

  const onSubmitOffer = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(offerAmount);
    setOfferError("");
    if (!Number.isFinite(amount) || amount <= 0) {
      setOfferError("กรอกราคาที่ต้องการเสนอ");
      return;
    }
    if (amount > productPrice) {
      setOfferError(`ราคาที่เสนอต้องไม่เกิน ฿${productPrice.toLocaleString("th-TH")}`);
      return;
    }
    setSending(true);
    try {
      await callApi(
        `/api/chat/${productId}/offer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toUserId: otherUser.id, amount }),
        },
        "เสนอราคาไม่สำเร็จ"
      );
      setOfferAmount("");
      setShowOfferForm(false);
      load();
    } catch (err) {
      setOfferError(messageOf(err, "เสนอราคาไม่สำเร็จ"));
    } finally {
      setSending(false);
    }
  };

  const onRespondOffer = async (offerId: string, accept: boolean) => {
    setBusyOfferId(offerId);
    try {
      await fetch(`/api/offers/${offerId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      load();
    } finally {
      setBusyOfferId(null);
    }
  };

  const onBuyWithOffer = async (offer: Offer) => {
    setBusyOfferId(offer.id);
    try {
      const data = await callApi<{ order: { id: string } }>("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, offerId: offer.id }),
      });
      router.push(`/orders/${data.order.id}`);
    } catch {
      // พฤติกรรมเดิม: ซื้อไม่สำเร็จ (เช่นข้อเสนอถูกยกเลิกไปแล้ว) ก็แค่โหลดแชทใหม่ให้เห็นสถานะล่าสุด
      load();
    } finally {
      setBusyOfferId(null);
    }
  };

  const onCancelAgreement = async (offerId: string) => {
    setBusyOfferId(offerId);
    try {
      await fetch(`/api/offers/${offerId}/cancel`, { method: "POST" });
      load();
    } finally {
      setBusyOfferId(null);
    }
  };

  const offerById = new Map(offers.map((o) => [o.id, o]));
  // ข้อตกลงที่ยังมีผลมีได้ครั้งละหนึ่งเดียว (ฐานข้อมูลบังคับไว้ใน migration 017) — ตราบใดที่ยังมี
  // อยู่ ปุ่มเสนอราคาต้องหายไป ไม่ใช่ปล่อยให้กดแล้วค่อยไปเด้ง error กลับมาจากเซิร์ฟเวอร์
  const acceptedOffer = offers.find((o) => o.status === "accepted") ?? null;

  return (
    <div className="flex flex-1 flex-col rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0">
      <div className="border-b border-neutral-100 px-4 py-3 text-sm font-medium text-neutral-900">
        {otherUser.name}
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4" style={{ minHeight: 320, maxHeight: 480 }}>
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-400">เริ่มทักทายกันได้เลย</p>
        ) : (
          messages.map((m) => {
            const mine = m.fromUserId === currentUserId;
            const offer = m.offerId ? offerById.get(m.offerId) : undefined;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                {offer ? (
                  <OfferBubble
                    offer={offer}
                    mine={mine}
                    isSeller={isSeller}
                    loading={busyOfferId === offer.id}
                    onRespond={(accept) => onRespondOffer(offer.id, accept)}
                    onBuy={() => onBuyWithOffer(offer)}
                    onCancelAgreement={() => onCancelAgreement(offer.id)}
                  />
                ) : (
                  <div
                    className={[
                      "max-w-[75%] rounded-[var(--radius-md)] px-3.5 py-2 text-sm",
                      mine ? "bg-primary-500 text-white" : "bg-neutral-100 text-neutral-900",
                    ].join(" ")}
                  >
                    {m.text}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {canNegotiate && !acceptedOffer && showOfferForm && (
        <form onSubmit={onSubmitOffer} className="flex flex-col gap-2 border-t border-neutral-100 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">฿</span>
            <input
              type="number"
              min={1}
              max={productPrice}
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              placeholder={`สูงสุด ${productPrice.toLocaleString("th-TH")}`}
              className="flex-1 rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-500"
            />
            <Button type="submit" size="sm" variant="primary" disabled={sending}>
              ส่งข้อเสนอ
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowOfferForm(false)}>
              ยกเลิก
            </Button>
          </div>
          {offerError && <p className="text-xs text-error-500">{offerError}</p>}
        </form>
      )}

      <form onSubmit={onSend} className="flex items-center gap-2 border-t border-neutral-100 p-3">
        {canNegotiate && !acceptedOffer && !showOfferForm && (
          <button
            type="button"
            onClick={() => setShowOfferForm(true)}
            className="flex-none rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-sm text-brand-text hover:bg-brand-surface"
          >
            เสนอราคา
          </button>
        )}
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
