"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage, MeetupProposal, Offer, Order, User } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { callApi, messageOf } from "@/lib/apiResponse";
import { parseThaiTime, resolveMeetupAt } from "@/lib/thaiTime";

/** ดูย้อนหลังกี่ข้อความเพื่อหาเวลานัด — ลึกกว่านี้จะขุดเวลาที่คุยกันจบไปแล้วขึ้นมาเสนอซ้ำ */
const TIME_SCAN_DEPTH = 8;

// ค่าที่ input type="datetime-local" ต้องการคือเวลาท้องถิ่นรูปแบบ YYYY-MM-DDTHH:mm — ใช้ toISOString
// ไม่ได้เพราะนั่นเป็น UTC ซึ่งจะเพี้ยนไป 7 ชั่วโมงสำหรับผู้ใช้ในไทย
const toDateTimeLocal = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const OFFER_BADGE = {
  pending: { label: "รอตอบรับ", status: "pending" as const },
  accepted: { label: "ตกลงราคานี้แล้ว", status: "success" as const },
  declined: { label: "ปฏิเสธข้อเสนอนี้แล้ว", status: "error" as const },
  cancelled: { label: "ยกเลิกแล้ว", status: "neutral" as const },
};

const MEETUP_BADGE = {
  pending: { label: "รอตอบรับ", status: "pending" as const },
  accepted: { label: "ตกลงนัดนี้แล้ว", status: "success" as const },
  declined: { label: "ขอเวลาอื่น", status: "neutral" as const },
  superseded: { label: "มีนัดใหม่ทับแล้ว", status: "neutral" as const },
};

// เวลาที่ผู้ใช้เห็นต้องเป็นเวลาไทยเสมอ (ผู้ใช้ทั้งหมดอยู่ในไทย) ส่วนที่เก็บในฐานข้อมูลเป็น UTC
const formatMeetupAt = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

// การ์ดขอนัดเจอ — โครงเดียวกับการ์ดเสนอราคา เพราะเป็นเรื่องเดียวกัน: ข้อเสนอที่อีกฝ่ายต้องตอบ
// ปุ่มฝั่งที่ถูกเสนอมีสองทางเสมอ "ตกลงตามนี้" กับ "เสนอเวลาอื่น" — ไม่มีปุ่มปฏิเสธเปล่าๆ เพราะ
// การปฏิเสธเฉยๆ ทำให้บทสนทนาตัน ทั้งที่สิ่งที่คนอยากสื่อจริงๆ คือ "เวลานี้ไม่ว่าง ขอเวลาอื่น"
function MeetupBubble({
  meetup,
  mine,
  onAccept,
  onProposeOther,
  loading,
}: {
  meetup: MeetupProposal;
  mine: boolean;
  onAccept: () => void;
  onProposeOther: () => void;
  loading: boolean;
}) {
  const badge = MEETUP_BADGE[meetup.status];
  const canRespond = !mine && meetup.status === "pending";

  return (
    <div
      className={[
        "max-w-[80%] rounded-[var(--radius-md)] border border-border bg-surface-card px-3.5 py-3 text-sm",
        mine ? "self-end" : "self-start",
      ].join(" ")}
    >
      <p className="text-xs text-neutral-500">ขอนัดเจอ</p>
      {meetup.meetupAt ? (
        <p className="mt-0.5 font-medium text-neutral-900">{formatMeetupAt(meetup.meetupAt)} น.</p>
      ) : (
        <p className="mt-0.5 font-medium text-neutral-400">ยังไม่ได้ระบุเวลา</p>
      )}
      <p className="mt-0.5 text-neutral-700">ที่ {meetup.place}</p>
      {/* นัดที่ไม่มีเวลายังไม่ใช่นัดจริง (ออเดอร์จะยังไม่ขึ้นว่า "นัดเจอแล้ว") เตือนไว้แบบไม่ตะโกน
          เพราะคนตั้งใจตกลงสถานที่ก่อนอยู่แล้ว ไม่ใช่ลืม */}
      {!meetup.meetupAt && (
        <p className="mt-1 text-center text-xs text-neutral-400">
          อย่าลืมนัดหมายเวลาเพื่อนัดรับ-ส่งสินค้า
        </p>
      )}
      <div className="mt-2">
        <Badge status={badge.status}>{badge.label}</Badge>
      </div>
      {canRespond && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" disabled={loading} onClick={onAccept}>
            ตกลงตามนี้
          </Button>
          <Button size="sm" variant="secondary" disabled={loading} onClick={onProposeOther}>
            เสนอเวลาอื่น
          </Button>
        </div>
      )}
      {mine && meetup.status === "pending" && (
        <p className="mt-2 text-xs text-neutral-500">รออีกฝ่ายตอบรับ</p>
      )}
    </div>
  );
}

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
  const [order, setOrder] = useState<Order | null>(null);
  const [meetups, setMeetups] = useState<MeetupProposal[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerError, setOfferError] = useState("");
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [showMeetupForm, setShowMeetupForm] = useState(false);
  const [meetupAt, setMeetupAt] = useState("");
  const [meetupPlace, setMeetupPlace] = useState("");
  const [meetupError, setMeetupError] = useState("");
  const [busyMeetupId, setBusyMeetupId] = useState<string | null>(null);
  // ข้อความที่ระบบอ่านเวลาได้แล้วผู้ใช้จัดการไปแล้ว (กดใช้หรือกดปิด) — ไม่ต้องเสนอซ้ำอีก
  const [handledTimeMessageId, setHandledTimeMessageId] = useState<string | null>(null);
  const [recentPlaces, setRecentPlaces] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await fetch(`/api/chat/${productId}?with=${otherUser.id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
      setOffers(data.offers ?? []);
      setOrder(data.order ?? null);
      setMeetups(data.meetups ?? []);
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

  const onSubmitMeetup = async (e: FormEvent) => {
    e.preventDefault();
    setMeetupError("");
    if (!order) return;
    // สถานที่คือสิ่งเดียวที่ขาดไม่ได้ ส่วนเวลาจะเคาะทีหลังก็ได้ (ดู migration 024)
    if (!meetupPlace.trim()) {
      setMeetupError("ระบุสถานที่นัด เช่น หน้า BTS อโศก ทางออก 3");
      return;
    }
    const when = meetupAt ? new Date(meetupAt) : null;
    if (when && Number.isNaN(when.getTime())) {
      setMeetupError("อ่านวันและเวลาที่เลือกไม่ออก");
      return;
    }
    if (when && when.getTime() <= Date.now()) {
      setMeetupError("เวลานัดต้องเป็นเวลาในอนาคต");
      return;
    }
    setSending(true);
    try {
      await callApi(
        `/api/orders/${order.id}/meetup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetupAt: when ? when.toISOString() : null, place: meetupPlace.trim() }),
        },
        "เสนอนัดไม่สำเร็จ"
      );
      setMeetupAt("");
      setMeetupPlace("");
      setShowMeetupForm(false);
      load();
    } catch (err) {
      setMeetupError(messageOf(err, "เสนอนัดไม่สำเร็จ"));
    } finally {
      setSending(false);
    }
  };

  const onRespondMeetup = async (meetupId: string, accept: boolean) => {
    setBusyMeetupId(meetupId);
    setMeetupError("");
    try {
      await callApi(
        `/api/meetups/${meetupId}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accept }),
        },
        "ตอบรับนัดไม่สำเร็จ"
      );
      load();
    } catch (err) {
      setMeetupError(messageOf(err, "ตอบรับนัดไม่สำเร็จ"));
      load();
    } finally {
      setBusyMeetupId(null);
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
  const meetupById = new Map(meetups.map((m) => [m.id, m]));
  // นัดได้เฉพาะตอนที่มีการจองแล้วและยังไม่ถึงขั้นส่งมอบ — ก่อนจองยังไม่มีอะไรให้นัด
  const canProposeMeetup =
    order !== null && (order.status === "reserved" || order.status === "meetup_scheduled");

  // อ่านเวลานัดจากข้อความที่คุยกันล่าสุด — เอาอันใหม่สุดที่อ่านออก และข้ามการ์ด (ข้อความของการ์ด
  // มีเวลาอยู่ในตัวอยู่แล้ว ถ้าไม่ข้ามจะวนเสนอเวลาเดิมที่เพิ่งเสนอไปไม่จบ)
  const detectedTime = useMemo(() => {
    if (!canProposeMeetup) return null;
    for (const m of messages.slice(-TIME_SCAN_DEPTH).reverse()) {
      if (m.meetupProposalId || m.offerId) continue;
      const parsed = parseThaiTime(m.text);
      if (!parsed) continue;
      return { at: resolveMeetupAt(parsed, new Date()), matched: parsed.matched, messageId: m.id };
    }
    return null;
  }, [messages, canProposeMeetup]);

  const showTimeChip =
    detectedTime !== null && !showMeetupForm && detectedTime.messageId !== handledTimeMessageId;

  const openMeetupForm = async (prefillAt?: Date) => {
    if (prefillAt) setMeetupAt(toDateTimeLocal(prefillAt));
    setShowMeetupForm(true);
    setMeetupError("");
    // ปุ่มลัดสถานที่ดึงตอนเปิดฟอร์มเท่านั้น ไม่ผูกไปกับ poll ของแชทที่ยิงทุก 4 วินาที
    try {
      const data = await callApi<{ places: string[] }>("/api/meetups/places");
      setRecentPlaces(data.places ?? []);
    } catch {
      // ไม่มีปุ่มลัดก็พิมพ์เองได้ ไม่ใช่เรื่องที่ต้องขึ้น error ให้ตกใจ
    }
  };

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
            const meetup = m.meetupProposalId ? meetupById.get(m.meetupProposalId) : undefined;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                {meetup ? (
                  <MeetupBubble
                    meetup={meetup}
                    mine={mine}
                    loading={busyMeetupId === meetup.id}
                    onAccept={() => onRespondMeetup(meetup.id, true)}
                    onProposeOther={async () => {
                      await onRespondMeetup(meetup.id, false);
                      openMeetupForm();
                    }}
                  />
                ) : offer ? (
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

      {/* นัดที่ตกลงกันแล้ว ปักไว้เหนือช่องพิมพ์ ไม่ต้องเลื่อนหาการ์ดเก่าในประวัติแชท */}
      {order?.meetupConfirmedAt && order.meetupAt && (
        <div className="border-t border-neutral-100 bg-success-50 px-3 py-2 text-xs text-neutral-700">
          นัดแล้ว {formatMeetupAt(order.meetupAt)} น. ที่ {order.meetupPlace}
        </div>
      )}

      {meetupError && !showMeetupForm && (
        <p className="border-t border-neutral-100 px-3 py-2 text-xs text-error-500">{meetupError}</p>
      )}

      {/* ระบบอ่านเวลาจากที่คุยกันได้ แต่ไม่บันทึกเอง — ภาษาไทยบอกเวลาหลายระบบปนกัน คนพิมพ์ต้อง
          เป็นคนยืนยันว่าอ่านถูก ("ห้าโมง" = 17:00 แต่ "ห้าโมงเช้า" = 11:00) */}
      {showTimeChip && detectedTime && (
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 bg-brand-surface px-3 py-2 text-xs">
          <span className="text-neutral-600">
            จากที่คุยกัน (&ldquo;{detectedTime.matched}&rdquo;) = {formatMeetupAt(detectedTime.at.toISOString())} น.
          </span>
          <button
            type="button"
            onClick={() => {
              setHandledTimeMessageId(detectedTime.messageId);
              openMeetupForm(detectedTime.at);
            }}
            className="rounded-[var(--radius-sm)] bg-primary-500 px-2.5 py-1 font-medium text-white hover:bg-primary-600"
          >
            ใช้เวลานี้นัด
          </button>
          <button
            type="button"
            onClick={() => setHandledTimeMessageId(detectedTime.messageId)}
            className="text-neutral-400 underline"
          >
            ไม่ใช่
          </button>
        </div>
      )}

      {canProposeMeetup && showMeetupForm && (
        <form onSubmit={onSubmitMeetup} className="flex flex-col gap-2 border-t border-neutral-100 p-3">
          <input
            type="datetime-local"
            value={meetupAt}
            onChange={(e) => setMeetupAt(e.target.value)}
            className="rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-500"
          />
          {/* คนขายของมือสองมักนัดที่เดิมซ้ำๆ — ปุ่มลัดตัดการพิมพ์ใหม่ทุกครั้งออก */}
          {recentPlaces.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recentPlaces.map((place) => (
                <button
                  key={place}
                  type="button"
                  onClick={() => setMeetupPlace(place)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-brand-text hover:bg-brand-surface"
                >
                  {place}
                </button>
              ))}
            </div>
          )}
          <input
            value={meetupPlace}
            onChange={(e) => setMeetupPlace(e.target.value)}
            maxLength={120}
            placeholder="สถานที่นัด เช่น หน้า BTS อโศก ทางออก 3"
            className="rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-500"
          />
          {!meetupAt && (
            <p className="text-center text-xs text-neutral-400">
              อย่าลืมนัดหมายเวลาเพื่อนัดรับ-ส่งสินค้า
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={sending}>
              ส่งคำขอนัด
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowMeetupForm(false)}>
              ยกเลิก
            </Button>
          </div>
          <p className="text-xs text-neutral-400">
            นัดในที่สาธารณะคนพลุกพล่านเสมอ และดูของให้ครบก่อนจ่ายเงิน
          </p>
          {meetupError && <p className="text-xs text-error-500">{meetupError}</p>}
        </form>
      )}

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
        {canProposeMeetup && !showMeetupForm && (
          <button
            type="button"
            onClick={() => openMeetupForm()}
            className="flex-none rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-sm text-brand-text hover:bg-brand-surface"
          >
            {order?.meetupConfirmedAt ? "เปลี่ยนนัด" : "นัดเจอ"}
          </button>
        )}
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
