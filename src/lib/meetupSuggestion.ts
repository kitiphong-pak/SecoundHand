import type { ChatMessage } from "@/types";
import { parseThaiTime, resolveMeetupAt } from "@/lib/thaiTime";

/** ดูย้อนหลังกี่ข้อความ — ลึกกว่านี้จะขุดเวลาที่คุยกันจบไปแล้วขึ้นมาเสนอซ้ำ */
export const TIME_SCAN_DEPTH = 8;

export interface TimeSuggestion {
  at: Date;
  /** ส่วนของข้อความที่อ่านมา ไว้โชว์ให้เห็นว่าระบบอ่านมาจากตรงไหน */
  matched: string;
  /** true = ผู้ใช้บอกแค่ช่วงกว้างๆ ("บ่าย") ระบบเดาเวลาให้ — หน้าจอต้องบอกว่าเป็นการเดา */
  approximate: boolean;
  messageId: string;
}

/**
 * หาเวลานัดที่ควรเสนอให้ผู้ใช้กดยืนยัน จากข้อความล่าสุดที่คุยกัน
 *
 * กติกาสามข้อ:
 *
 * 1. เสนอเฉพาะกับ "คนที่พิมพ์เวลานั้นเอง" — คนพิมพ์คือคนที่ตั้งใจนัด ส่วนอีกฝ่ายยังไม่ได้ตกลงอะไร
 *    การไปถามทั้งสองฝ่ายทำให้เกิดการเสนอนัดซ้อนกันสองอัน และคนที่ยังไม่ได้ตกลงก็ถูกถามทั้งที่
 *    ไม่ได้เป็นคนพูด
 * 2. ข้ามข้อความที่เป็นการ์ด (เสนอราคา/เสนอนัด) — การ์ดมีเวลาอยู่ในตัวอยู่แล้ว ถ้าไม่ข้ามจะวน
 *    เสนอเวลาเดิมที่เพิ่งเสนอไปไม่จบ
 * 3. เอาอันล่าสุดที่อ่านออก เพราะคนเปลี่ยนใจได้ระหว่างคุย
 */
export function findTimeSuggestion(
  messages: ChatMessage[],
  currentUserId: string,
  now: Date
): TimeSuggestion | null {
  for (const m of messages.slice(-TIME_SCAN_DEPTH).reverse()) {
    if (m.fromUserId !== currentUserId) continue;
    if (m.meetupProposalId || m.offerId) continue;
    const parsed = parseThaiTime(m.text);
    if (!parsed) continue;
    return {
      at: resolveMeetupAt(parsed, now),
      matched: parsed.matched,
      approximate: parsed.approximate,
      messageId: m.id,
    };
  }
  return null;
}
