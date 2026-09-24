import type { ChatMessage } from "@/types";

/**
 * ข้อความที่ส่งติดกันภายในเวลานี้ของคนเดียวกัน ถือเป็นกลุ่มเดียว
 *
 * คนพิมพ์ยาวๆ มักส่งเป็นหลายข้อความรวด ถ้าโชว์เวลาและรูปโปรไฟล์ทุกใบ หน้าจอจะเต็มไปด้วยของซ้ำ
 * จนอ่านยาก — จัดกลุ่มแล้วโชว์เวลาแค่ใบสุดท้ายของกลุ่มพอ
 */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type ChatRow =
  | { kind: "date"; key: string; label: string }
  | {
      kind: "message";
      key: string;
      message: ChatMessage;
      /** ใบแรกของกลุ่ม — ใบที่ควรมีรูปโปรไฟล์กำกับ */
      startsGroup: boolean;
      /** ใบสุดท้ายของกลุ่ม — ใบที่ควรมีเวลาและสถานะอ่านแล้ว */
      endsGroup: boolean;
    };

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

// "วันนี้/เมื่อวาน" อ่านง่ายกว่าวันที่เต็มสำหรับข้อความที่เพิ่งคุยกัน ส่วนที่เก่ากว่านั้นบอกวันที่ไปเลย
// เพราะ "3 วันก่อน" ต้องนับนิ้วเอาเอง
const dateLabel = (iso: string, now: Date) => {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dayKey(iso) === dayKey(now.toISOString())) return "วันนี้";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
};

/** การ์ด (เสนอราคา/ขอนัดเจอ) มีกรอบของตัวเอง จึงไม่ถูกรวมกลุ่มกับข้อความธรรมดา */
const isCard = (m: ChatMessage) => Boolean(m.offerId || m.meetupProposalId);

/**
 * แปลงรายการข้อความดิบเป็นแถวที่พร้อมวาด — แทรกเส้นคั่นวัน และบอกว่าข้อความไหนเป็นหัว/ท้ายกลุ่ม
 *
 * แยกออกมาจากคอมโพเนนต์เพราะเป็นตรรกะล้วนที่เทสได้ ส่วนการวาดเป็นแค่การอ่านค่าที่คำนวณไว้แล้ว
 */
export function buildChatRows(messages: ChatMessage[], now: Date): ChatRow[] {
  const rows: ChatRow[] = [];

  messages.forEach((message, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];

    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
    if (newDay) {
      rows.push({
        kind: "date",
        key: `date-${dayKey(message.createdAt)}`,
        label: dateLabel(message.createdAt, now),
      });
    }

    // ไม่ต้องเช็คว่าข้ามวันหรือยังในนี้ — การข้ามวันถูกตัดกลุ่มด้วย newDay กับเงื่อนไข dayKey
    // ของ endsGroup ข้างล่างอยู่แล้ว ใส่ซ้ำจะกลายเป็นเงื่อนไขที่ลบทิ้งแล้วไม่มีเทสไหนพัง
    const sameGroup = (a: ChatMessage | undefined, b: ChatMessage) =>
      Boolean(
        a &&
          !isCard(a) &&
          !isCard(b) &&
          a.fromUserId === b.fromUserId &&
          Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) <= GROUP_WINDOW_MS
      );

    rows.push({
      kind: "message",
      key: message.id,
      message,
      startsGroup: newDay || !sameGroup(prev, message),
      endsGroup: !next || dayKey(next.createdAt) !== dayKey(message.createdAt) || !sameGroup(message, next),
    });
  });

  return rows;
}
