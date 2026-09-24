"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ChatMessage, MeetupProposal, Offer, Order, User } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { callApi, messageOf } from "@/lib/apiResponse";
import { findTimeSuggestion, TIME_SCAN_DEPTH } from "@/lib/meetupSuggestion";
import { buildChatRows } from "@/lib/chatGrouping";
import { orderStatusBadge } from "@/lib/orderStatus";

/** แผงขวาสลับได้ว่าจะดูอะไร — เริ่มจากสองอันนี้ก่อน เพิ่มทีหลังได้โดยไม่ต้องแตะที่อื่น */
const PANEL_TABS = [
  { key: "product" as const, label: "สินค้า" },
  { key: "meetup" as const, label: "นัดเจอ" },
];
type PanelTab = (typeof PANEL_TABS)[number]["key"];

/** จำไว้ว่าผู้ใช้พับแผงขวาไว้หรือเปิดค้างไว้ — ของแบบนี้ถ้าลืมทุกครั้งที่เปลี่ยนห้องจะน่ารำคาญมาก */
const PANEL_STORAGE_KEY = "songtor.chat.panel";

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

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

// รูปโปรไฟล์คู่สนทนา — ยังไม่มีรูปก็ใช้ตัวอักษรแรกของชื่อแทน จะได้ไม่มีช่องว่างโบ๋ข้างฟองข้อความ
function Avatar({ user }: { user: Pick<User, "id" | "name" | "avatarUrl"> }) {
  if (user.avatarUrl) {
    // ใช้ img ธรรมดาเพราะรูปมาจากโดเมนของผู้ใช้เอง และขนาดคงที่ 28px ไม่ได้ต้องการการย่อรูปของ next/image
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="h-7 w-7 flex-none rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600">
      {user.name.trim().charAt(0)}
    </div>
  );
}

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
  product,
  productPrice,
  isSeller,
  canNegotiate,
}: {
  productId: string;
  currentUserId: string;
  otherUser: Pick<User, "id" | "name" | "avatarUrl">;
  product: { id: string; title: string; image: string | null };
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
  //
  // ต้องจำข้ามการเปิดหน้า ไม่งั้นกด "ไม่ใช่" ไปแล้วพอเปิดแชทใหม่ก็โดนถามเรื่องเดิมซ้ำทุกครั้ง
  // เก็บแยกตามห้องแชท และตัดให้เหลือเท่าที่จำเป็น เพราะข้อความเก่ากว่านั้นไม่มีวันถูกเสนออีกแล้ว
  const [handledTimeIds, setHandledTimeIds] = useState<string[]>([]);
  const [recentPlaces, setRecentPlaces] = useState<string[]>([]);
  const handledStorageKey = `songtor.chat.handledTime.${productId}.${otherUser.id}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(handledStorageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setHandledTimeIds(JSON.parse(saved) as string[]);
    } catch {
      // อ่านไม่ได้ก็แค่ถามใหม่อีกครั้ง ไม่ใช่เรื่องที่ต้องแจ้งผู้ใช้
    }
  }, [handledStorageKey]);

  const markTimeHandled = (messageId: string) => {
    setHandledTimeIds((current) => {
      const next = [...current.filter((id) => id !== messageId), messageId].slice(-TIME_SCAN_DEPTH * 2);
      try {
        localStorage.setItem(handledStorageKey, JSON.stringify(next));
      } catch {
        // จำไม่ได้ก็ยังใช้งานต่อได้ในรอบนี้
      }
      return next;
    });
  };
  // เริ่มต้นพับไว้ก่อน — กางแล้วเบียดพื้นที่อ่านข้อความ คนที่อยากได้ค่อยกดเปิดแล้วระบบจะจำไว้ให้
  const [panel, setPanel] = useState<PanelTab | null>(null);

  // อ่านค่าที่เคยเลือกไว้หลัง mount (ไม่ใช่ตอน render แรก) เพื่อไม่ให้ HTML ฝั่งเซิร์ฟเวอร์กับ
  // ฝั่งเบราว์เซอร์ไม่ตรงกัน — localStorage อ่านได้เฉพาะบนเบราว์เซอร์
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PANEL_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "hidden") setPanel(null);
      else if (saved === "meetup" || saved === "product") setPanel(saved);
    } catch {
      // เบราว์เซอร์บล็อก storage ไว้ก็ใช้ค่าเริ่มต้นไป ไม่ใช่เรื่องที่ต้องแจ้งผู้ใช้
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_STORAGE_KEY, panel ?? "hidden");
    } catch {
      // เหมือนด้านบน จำไม่ได้ก็ไม่เป็นไร
    }
  }, [panel]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const onSend = async (e: { preventDefault: () => void }) => {
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
      if (inputRef.current) inputRef.current.style.height = "auto";
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

  // เส้นคั่นวันและการจัดกลุ่มข้อความคำนวณที่เดียวใน chatGrouping.ts (มีเทสคุม) ที่นี่แค่เอามาวาด
  const rows = useMemo(() => buildChatRows(messages, new Date()), [messages]);

  // "อ่านแล้ว" โชว์ใบเดียวพอ — ใบล่าสุดที่เราส่งแล้วอีกฝ่ายอ่านแล้ว ถ้าโชว์ทุกใบจะรกและไม่ได้บอกอะไรเพิ่ม
  const lastReadMineId = [...messages]
    .reverse()
    .find((m) => m.fromUserId === currentUserId && m.read)?.id;

  const orderBadge = orderStatusBadge(order?.status ?? "reserved", isSeller ? "seller" : "buyer");
  const offerById = new Map(offers.map((o) => [o.id, o]));
  // ข้อตกลงที่ยังมีผลมีได้ครั้งละหนึ่งเดียว (ฐานข้อมูลบังคับไว้ใน migration 017) — ตราบใดที่ยังมี
  // อยู่ ปุ่มเสนอราคาต้องหายไป ไม่ใช่ปล่อยให้กดแล้วค่อยไปเด้ง error กลับมาจากเซิร์ฟเวอร์
  const acceptedOffer = offers.find((o) => o.status === "accepted") ?? null;
  const meetupById = new Map(meetups.map((m) => [m.id, m]));
  // นัดได้เฉพาะตอนที่มีการจองแล้วและยังไม่ถึงขั้นส่งมอบ — ก่อนจองยังไม่มีอะไรให้นัด
  const canProposeMeetup =
    order !== null && (order.status === "reserved" || order.status === "meetup_scheduled");

  const lastProposalAt =
    meetups.length > 0
      ? [...meetups].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt
      : null;

  // อ่านเวลานัดจากข้อความที่ "เราเป็นคนพิมพ์" เท่านั้น — ดูกติกาทั้งหมดใน meetupSuggestion.ts
  const detectedTime = useMemo(
    () =>
      canProposeMeetup
        ? findTimeSuggestion(messages, currentUserId, new Date(), lastProposalAt)
        : null,
    [messages, currentUserId, canProposeMeetup, lastProposalAt]
  );

  // ชิปกับฟอร์มลอยอยู่ตำแหน่งเดียวกัน จึงต้องไม่โผล่พร้อมกัน
  const showTimeChip =
    detectedTime !== null &&
    !showMeetupForm &&
    !showOfferForm &&
    !handledTimeIds.includes(detectedTime.messageId);

  // สถานที่ที่ใช้อยู่ตอนนี้ — นัดที่ตกลงกันแล้วมาก่อน ถ้ายังไม่มีก็เอาจากข้อเสนอล่าสุดที่เคยพิมพ์ไป
  const currentPlace =
    order?.meetupPlace ??
    [...meetups].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.place ??
    "";

  const openMeetupForm = async (prefillAt?: Date) => {
    if (prefillAt) setMeetupAt(toDateTimeLocal(prefillAt));
    // เปลี่ยนแค่เวลาไม่ต้องเลือกสถานที่ใหม่ — เติมที่เดิมไว้ให้ ใครจะย้ายที่ก็แก้ในช่องได้เหมือนเดิม
    setMeetupPlace((current) => current || currentPlace);
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
    <div className="flex min-h-0 flex-1 gap-4">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
        <Avatar user={otherUser} />
        <span className="flex-1 truncate text-sm font-medium text-neutral-900">{otherUser.name}</span>
        {/* ปุ่มพับ/กางแผงขวา — โชว์เฉพาะจอที่กว้างพอจะมีแผงข้างได้จริง จอแคบกว่านั้นแผงไม่เคยโผล่อยู่แล้ว */}
        <button
          type="button"
          onClick={() => setPanel(panel ? null : "product")}
          aria-label={panel ? "ซ่อนแผงรายละเอียด" : "แสดงแผงรายละเอียด"}
          className="hidden h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 xl:flex"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            {panel ? (
              <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" />
            ) : (
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z" />
            )}
          </svg>
        </button>
      </div>

      {/* นัดที่ตกลงกันแล้วกับชิปถามเวลาลอยคนละมุม (บนสุด / ล่างสุด) ตั้งใจให้อยู่ไกลกันไปเลย —
          ตอนอยู่ชั้นเดียวกันมันเบียดกันจนอ่านยาก และอย่างหนึ่งเป็นข้อมูลถาวร อีกอย่างเป็นคำถาม
          ชั่วคราวที่ต้องอยู่ติดมือใกล้ช่องพิมพ์ */}
      {/* min-h-0 ขาดไม่ได้ในทุกชั้นของสายนี้ — ค่าเริ่มต้นของ flex item คือห้ามหดต่ำกว่าเนื้อหา
          ถ้าไม่ใส่ กล่องข้อความจะดันความสูงจนช่องพิมพ์ตกขอบล่างจอไปเลย แทนที่จะเลื่อนในตัวเอง */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* นัดที่ตกลงกันแล้ว ปักไว้บนสุดของแชท ไม่ต้องเลื่อนหาการ์ดเก่าในประวัติ */}
        {order?.meetupConfirmedAt && order.meetupAt && (
          <div className="absolute inset-x-0 top-0 z-10 border-b border-neutral-200 bg-success-50 px-3 py-2 text-xs text-neutral-700 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
            นัดแล้ว {formatMeetupAt(order.meetupAt)} น. ที่ {order.meetupPlace}
          </div>
        )}

      {/* เว้นที่หัวท้ายไว้ให้แถบที่ลอยอยู่ ไม่บังข้อความแรกสุด/ล่าสุดตอนเลื่อนไปสุดทาง */}
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-12 ${
          order?.meetupConfirmedAt ? "pt-12" : "pt-4"
        }`}
      >
        {rows.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-400">เริ่มทักทายกันได้เลย</p>
        ) : (
          rows.map((row) => {
            if (row.kind === "date") {
              return (
                <div key={row.key} className="my-3 flex justify-center">
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] text-neutral-500">
                    {row.label}
                  </span>
                </div>
              );
            }

            const m = row.message;
            const mine = m.fromUserId === currentUserId;
            const offer = m.offerId ? offerById.get(m.offerId) : undefined;
            const meetup = m.meetupProposalId ? meetupById.get(m.meetupProposalId) : undefined;
            const card = meetup ? (
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
            ) : null;

            return (
              <div
                key={row.key}
                className={`flex items-start gap-2 ${row.startsGroup ? "mt-3" : "mt-0.5"} ${
                  mine ? "justify-end" : "justify-start"
                }`}
              >
                {/* รูปโปรไฟล์เกาะอยู่กับข้อความ "ใบแรก" ของกลุ่ม ตรงกับบรรทัดชื่อ ส่วนใบถัดๆ ไปเว้น
                    ที่ว่างขนาดเท่ากันไว้ ฟองจะได้เรียงตรงกันเป็นแนวเดียว */}
                {!mine &&
                  (row.startsGroup ? (
                    <Avatar user={otherUser} />
                  ) : (
                    <div className="h-7 w-7 flex-none" />
                  ))}

                <div className={`flex max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
                  {/* ชื่อกับเวลาอยู่เหนือกลุ่ม ไม่ใช่ใต้ทุกฟอง — อ่านรวดเดียวได้ว่าใครพูดตอนไหน
                      และไม่มีตัวเลขแทรกระหว่างฟองในกลุ่มเดียวกัน */}
                  {row.startsGroup && (
                    <p className="mb-1 flex items-center gap-2 px-1 text-[11px] text-neutral-400">
                      {!mine && <span className="font-medium text-neutral-600">{otherUser.name}</span>}
                      <span>{formatTime(m.createdAt)}</span>
                    </p>
                  )}
                  {card ?? (
                    <div
                      className={[
                        "px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                        mine
                          ? `bg-primary-500 text-white ${row.endsGroup ? "rounded-2xl rounded-br-sm" : "rounded-2xl"}`
                          : `bg-neutral-100 text-neutral-900 ${row.endsGroup ? "rounded-2xl rounded-bl-sm" : "rounded-2xl"}`,
                      ].join(" ")}
                    >
                      {m.text}
                    </div>
                  )}
                  {m.id === lastReadMineId && (
                    <p className="mt-1 px-1 text-[11px] text-neutral-400">อ่านแล้ว</p>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      </div>

      {/* ของชั่วคราวที่อยู่เหนือช่องพิมพ์ (ชิปถามเวลา, ฟอร์มนัด, ฟอร์มเสนอราคา) ลอยทับกล่องแชท
          ไม่ต่อท้ายให้กล่องสูงขึ้น — ไม่งั้นทุกครั้งที่มีอะไรโผล่มา ข้อความในแชทจะถูกดันหายไปจาก
          สายตาและหน้าทั้งหน้าจะกระโดด ยึดที่ bottom-full ของกล่องนี้ จึงอยู่เหนือช่องพิมพ์พอดีเสมอ */}
      <div className="relative">
      <div className="absolute inset-x-0 bottom-full z-10 flex flex-col overflow-hidden rounded-t-[var(--radius-lg)] shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
        {meetupError && !showMeetupForm && (
          <p className="border-t border-neutral-200 bg-neutral-0 px-3 py-2 text-xs text-error-500">
            {meetupError}
          </p>
        )}

      {/* ระบบอ่านเวลาจากที่คุยกันได้ แต่ไม่บันทึกเอง — ภาษาไทยบอกเวลาหลายระบบปนกัน คนพิมพ์ต้อง
          เป็นคนยืนยันว่าอ่านถูก ("ห้าโมง" = 17:00 แต่ "ห้าโมงเช้า" = 11:00) */}
      {showTimeChip && detectedTime && (
        <div className="sheet-in flex flex-wrap items-center gap-2 border-t border-neutral-200 bg-brand-surface px-3 py-2 text-xs">
          {/* คำกว้างๆ อย่าง "บ่าย" ระบบเดาเวลากลางๆ ให้ ต้องเขียนให้เห็นว่าเดา ไม่ใช่เวลาที่ผู้ใช้
              ระบุเอง ไม่งั้นคนกดยืนยันผ่านๆ แล้วได้นัดบ่ายสองทั้งที่ตั้งใจบอกแค่ "ช่วงบ่ายก็ได้" */}
          <span className="text-neutral-600">
            จากที่คุยกัน (&ldquo;{detectedTime.matched}&rdquo;){" "}
            {detectedTime.approximate ? "น่าจะราวๆ" : "="}{" "}
            {formatMeetupAt(detectedTime.at.toISOString())} น.
          </span>
          <button
            type="button"
            onClick={() => {
              markTimeHandled(detectedTime.messageId);
              openMeetupForm(detectedTime.at);
            }}
            className="rounded-[var(--radius-sm)] bg-primary-500 px-2.5 py-1 font-medium text-white hover:bg-primary-600"
          >
            ใช้เวลานี้นัด
          </button>
          <button
            type="button"
            onClick={() => markTimeHandled(detectedTime.messageId)}
            className="text-neutral-400 underline"
          >
            ไม่ใช่
          </button>
        </div>
      )}
      </div>

      {canProposeMeetup && showMeetupForm && (
        <form
          onSubmit={onSubmitMeetup}
          className="sheet-in absolute inset-x-0 bottom-full z-20 flex max-h-[60vh] flex-col gap-2 overflow-y-auto rounded-t-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
        >
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
        <form
          onSubmit={onSubmitOffer}
          className="sheet-in absolute inset-x-0 bottom-full z-20 flex flex-col gap-2 rounded-t-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
        >
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
        {/* textarea แทน input เพื่อให้พิมพ์ข้อความหลายบรรทัดได้ และสูงตามเนื้อหาจนถึงเพดานหนึ่ง
            Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่ ตามที่คนคุ้นจากแอปแชททั่วไป */}
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend(e);
            }
          }}
          placeholder="พิมพ์ข้อความ..."
          className="max-h-[120px] flex-1 resize-none rounded-[var(--radius-xl)] border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-primary-500"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          aria-label="ส่งข้อความ"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:bg-neutral-200"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" />
          </svg>
        </button>
      </form>
      </div>
    </div>

    {/* แผงขวา: พับเก็บได้ และสลับได้ว่าจะดูอะไร — อยู่ในคอมโพเนนต์นี้เพราะแท็บ "นัดเจอ" ใช้ข้อมูล
        ออเดอร์/ข้อเสนอนัดและปุ่มเปิดฟอร์มชุดเดียวกับในแชท ไม่ต้องไปดึงข้อมูลซ้ำอีกรอบ */}
    {panel && (
      <aside className="hidden w-72 min-h-0 flex-none flex-col overflow-hidden rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 xl:flex">
        <div className="flex border-b border-neutral-100">
          {PANEL_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPanel(tab.key)}
              className={`flex-1 px-3 py-2.5 text-sm ${
                panel === tab.key
                  ? "border-b-2 border-primary-500 font-medium text-primary-600"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {panel === "product" ? (
            <div className="flex flex-col gap-3">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image}
                  alt={product.title}
                  className="h-32 w-full rounded-[var(--radius-md)] object-cover"
                />
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded-[var(--radius-md)] bg-neutral-100 text-xs text-neutral-400">
                  ไม่มีรูปภาพ
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-neutral-900">{product.title}</p>
                <p className="mt-0.5 font-[var(--font-display)] text-lg font-semibold text-primary-600">
                  ฿{productPrice.toLocaleString("th-TH")}
                </p>
              </div>
              {order && (
                <div className="rounded-[var(--radius-md)] border border-neutral-200 p-3">
                  <p className="text-xs text-neutral-400">ออเดอร์</p>
                  <div className="mt-1">
                    <Badge status={orderBadge.status}>{orderBadge.label}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-neutral-700">
                    ยอด ฿{order.amount.toLocaleString("th-TH")}
                  </p>
                  <Link
                    href={`/orders/${order.id}`}
                    className="mt-2 inline-block text-sm font-medium text-primary-600 hover:underline"
                  >
                    เปิดหน้าออเดอร์ →
                  </Link>
                </div>
              )}
              <Link
                href={`/products/${product.id}`}
                className="text-sm font-medium text-primary-600 hover:underline"
              >
                ดูหน้าสินค้า →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {!canProposeMeetup ? (
                <p className="text-sm text-neutral-500">
                  {order
                    ? "ออเดอร์นี้ไม่ได้อยู่ในขั้นตอนนัดเจอแล้ว"
                    : "ยังไม่มีการจอง — นัดเจอได้หลังผู้ซื้อกดจองสินค้าแล้ว"}
                </p>
              ) : (
                <>
                  <div className="rounded-[var(--radius-md)] border border-neutral-200 p-3">
                    <p className="text-xs text-neutral-400">นัดที่ตกลงกันแล้ว</p>
                    {order?.meetupConfirmedAt && order.meetupAt ? (
                      <>
                        <p className="mt-1 text-sm font-medium text-neutral-900">
                          {formatMeetupAt(order.meetupAt)} น.
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-700">ที่ {order.meetupPlace}</p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-neutral-400">ยังไม่ได้นัด</p>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      onClick={() => openMeetupForm()}
                    >
                      {order?.meetupConfirmedAt ? "เปลี่ยนนัด" : "นัดเจอ"}
                    </Button>
                  </div>

                  {meetups.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-neutral-400">ประวัติข้อเสนอนัด</p>
                      <ul className="flex flex-col gap-2">
                        {[...meetups]
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .map((mp) => (
                            <li
                              key={mp.id}
                              className="rounded-[var(--radius-md)] border border-neutral-200 p-2 text-xs"
                            >
                              <p className="text-neutral-700">
                                {mp.meetupAt ? `${formatMeetupAt(mp.meetupAt)} น.` : "ยังไม่ระบุเวลา"}
                              </p>
                              <p className="text-neutral-500">ที่ {mp.place}</p>
                              <p className="mt-1">
                                <Badge status={MEETUP_BADGE[mp.status].status}>
                                  {MEETUP_BADGE[mp.status].label}
                                </Badge>
                              </p>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    )}
    </div>
  );
}
