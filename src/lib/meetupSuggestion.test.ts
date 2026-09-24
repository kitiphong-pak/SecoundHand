import { describe, it, expect } from "vitest";
import { findTimeSuggestion, TIME_SCAN_DEPTH } from "./meetupSuggestion";
import type { ChatMessage } from "@/types";

const ME = "me-1";
const THEM = "them-1";

let seq = 0;
const msg = (over: Partial<ChatMessage> & { text: string }): ChatMessage => ({
  id: `m${++seq}`,
  productId: "p1",
  fromUserId: ME,
  toUserId: THEM,
  createdAt: "2026-09-23T10:00:00Z",
  read: true,
  ...over,
});

const now = new Date(2026, 8, 23, 9, 0, 0); // พุธ 23 ก.ย. 09:00

describe("เลือกเวลาที่จะเสนอให้กดยืนยัน", () => {
  it("ข้อความของเราที่มีเวลา → เสนอเวลานั้น", () => {
    const s = findTimeSuggestion([msg({ text: "เจอกันตอน 5 โมงนะ" })], ME, now);
    expect(s).not.toBeNull();
    expect(s!.at.getHours()).toBe(17);
    expect(s!.matched).toBe("5 โมง");
  });

  // ข้อนี้คือกติกาที่สำคัญที่สุด: คนพิมพ์คือคนที่ตั้งใจนัด ถ้าถามทั้งสองฝ่ายจะได้ข้อเสนอนัดซ้อนกัน
  // สองอัน และคนที่ยังไม่ได้ตกลงอะไรก็ถูกถามทั้งที่ไม่ได้เป็นคนพูด
  it("ข้อความของอีกฝ่าย ต้องไม่ถูกเสนอให้เรากดยืนยัน", () => {
    const messages = [msg({ text: "เจอกันตอน 5 โมงนะ", fromUserId: THEM, toUserId: ME })];
    expect(findTimeSuggestion(messages, ME, now)).toBeNull();
    // แต่ฝั่งคนพิมพ์เองต้องได้
    expect(findTimeSuggestion(messages, THEM, now)).not.toBeNull();
  });

  it("ข้ามข้อความที่เป็นการ์ด ไม่งั้นจะวนเสนอเวลาเดิมที่เพิ่งเสนอไปแล้ว", () => {
    const messages = [
      msg({ text: "ขอนัดเจอ 24/09 17:00 น. ที่ หน้าห้าง", meetupProposalId: "mp1" }),
      msg({ text: "เสนอราคา ฿1,200", offerId: "of1" }),
    ];
    expect(findTimeSuggestion(messages, ME, now)).toBeNull();
  });

  it("มีหลายเวลาในบทสนทนา → เอาอันล่าสุด เพราะคนเปลี่ยนใจได้", () => {
    const messages = [msg({ text: "บ่าย 2 ได้มั้ย" }), msg({ text: "หรือ 2 ทุ่มดีกว่า" })];
    expect(findTimeSuggestion(messages, ME, now)!.at.getHours()).toBe(20);
  });

  // อาการที่เจอจริง: เปิดแชทใหม่ทีไรก็โดนถามเรื่องเวลาเดิมซ้ำ ทั้งที่เสนอนัดกันไปแล้ว
  it("ข้อความที่พิมพ์ก่อนการเสนอนัดครั้งล่าสุด ต้องไม่ถูกขุดมาถามซ้ำ", () => {
    const messages = [msg({ text: "เจอกันตอน 5 โมงนะ", createdAt: "2026-09-23T10:00:00Z" })];
    expect(findTimeSuggestion(messages, ME, now, "2026-09-23T10:05:00Z")).toBeNull();
    // แต่ถ้าพิมพ์เวลาใหม่หลังเสนอนัดไปแล้ว ต้องถามตามปกติ เพราะเป็นการเปลี่ยนใจ
    expect(findTimeSuggestion(messages, ME, now, "2026-09-23T09:00:00Z")).not.toBeNull();
  });

  it("ข้อความที่ไม่มีเวลาเลย → ไม่เสนออะไร", () => {
    const messages = [msg({ text: "สนใจครับ" }), msg({ text: "ลดเหลือ 500 ได้มั้ย" })];
    expect(findTimeSuggestion(messages, ME, now)).toBeNull();
  });

  it("ไม่ขุดย้อนหลังเกินที่กำหนด", () => {
    const messages = [
      msg({ text: "เจอกัน 2 ทุ่ม" }),
      ...Array.from({ length: TIME_SCAN_DEPTH }, () => msg({ text: "ครับผม" })),
    ];
    expect(findTimeSuggestion(messages, ME, now)).toBeNull();
  });
});
