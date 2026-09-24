import { describe, it, expect } from "vitest";
import { buildChatRows, GROUP_WINDOW_MS, type ChatRow } from "./chatGrouping";
import type { ChatMessage } from "@/types";

const ME = "me-1";
const THEM = "them-1";

let seq = 0;
const msg = (over: Partial<ChatMessage> & { createdAt: string }): ChatMessage => ({
  id: `m${++seq}`,
  productId: "p1",
  fromUserId: ME,
  toUserId: THEM,
  text: "ข้อความ",
  read: true,
  ...over,
});

const at = (iso: string) => new Date(iso).toISOString();
const now = new Date("2026-09-24T10:00:00+07:00");

const labels = (rows: ChatRow[]) => rows.filter((r) => r.kind === "date").map((r) => r.label);

// วาดรูปแบบกลุ่มเป็นข้อความสั้นๆ อ่านง่ายกว่าเทียบ boolean ทีละตัว: [x] = ยืนเดี่ยว, [x กับ x] = หัว/ท้ายกลุ่ม
const groupsOf = (rows: ChatRow[]) =>
  rows
    .filter((r): r is Extract<ChatRow, { kind: "message" }> => r.kind === "message")
    .map((r) => `${r.startsGroup ? "[" : " "}x${r.endsGroup ? "]" : " "}`)
    .join("");

describe("เส้นคั่นวัน", () => {
  it("แทรกทุกครั้งที่ข้ามวัน และเรียกวันล่าสุดว่าวันนี้/เมื่อวาน", () => {
    const rows = buildChatRows(
      [
        msg({ createdAt: at("2026-09-20T09:00:00+07:00") }),
        msg({ createdAt: at("2026-09-23T09:00:00+07:00") }),
        msg({ createdAt: at("2026-09-24T09:00:00+07:00") }),
      ],
      now
    );
    expect(labels(rows)).toEqual(["20 ก.ย. 2569", "เมื่อวาน", "วันนี้"]);
  });

  it("ข้อความหลายใบในวันเดียวกัน มีเส้นคั่นใบเดียว", () => {
    const rows = buildChatRows(
      [
        msg({ createdAt: at("2026-09-24T09:00:00+07:00") }),
        msg({ createdAt: at("2026-09-24T09:30:00+07:00") }),
      ],
      now
    );
    expect(labels(rows)).toEqual(["วันนี้"]);
  });
});

describe("จัดกลุ่มข้อความ", () => {
  it("ข้อความติดกันของคนเดียวกันในเวลาใกล้กัน = กลุ่มเดียว", () => {
    const rows = buildChatRows(
      [
        msg({ createdAt: at("2026-09-24T09:00:00+07:00") }),
        msg({ createdAt: at("2026-09-24T09:01:00+07:00") }),
        msg({ createdAt: at("2026-09-24T09:02:00+07:00") }),
      ],
      now
    );
    // หัวกลุ่มใบเดียว ท้ายกลุ่มใบเดียว ใบกลางไม่ต้องมีรูปหรือเวลา
    expect(groupsOf(rows)).toBe("[x  x  x]");
  });

  it("คนละคนพูด = คนละกลุ่มเสมอ", () => {
    const rows = buildChatRows(
      [
        msg({ createdAt: at("2026-09-24T09:00:00+07:00") }),
        msg({ createdAt: at("2026-09-24T09:00:30+07:00"), fromUserId: THEM, toUserId: ME }),
      ],
      now
    );
    expect(groupsOf(rows)).toBe("[x][x]");
  });

  // ทิ้งช่วงนานแล้วพิมพ์ต่อ คือคนละบทสนทนาในสายตาคนอ่าน ต้องเห็นเวลาใหม่
  it("ห่างเกินช่วงที่กำหนด = ขึ้นกลุ่มใหม่ แม้เป็นคนเดียวกัน", () => {
    const start = new Date("2026-09-24T09:00:00+07:00");
    const later = new Date(start.getTime() + GROUP_WINDOW_MS + 1000);
    const rows = buildChatRows(
      [msg({ createdAt: at(start.toISOString()) }), msg({ createdAt: at(later.toISOString()) })],
      now
    );
    expect(groupsOf(rows)).toBe("[x][x]");
  });

  it("ข้ามวันแล้วต้องไม่ถูกนับเป็นกลุ่มเดียวกัน ต่อให้ห่างกันไม่กี่นาที", () => {
    const rows = buildChatRows(
      [
        msg({ createdAt: at("2026-09-23T23:58:00+07:00") }),
        msg({ createdAt: at("2026-09-24T00:01:00+07:00") }),
      ],
      now
    );
    expect(groupsOf(rows)).toBe("[x][x]");
  });

  // การ์ดมีกรอบของตัวเอง ถ้าถูกรวมกลุ่มกับข้อความธรรมดา มุมฟองจะต่อกับการ์ดจนดูเพี้ยน
  it("การ์ดเสนอราคา/ขอนัดเจอ ยืนเดี่ยวเสมอ", () => {
    const rows = buildChatRows(
      [
        msg({ createdAt: at("2026-09-24T09:00:00+07:00") }),
        msg({ createdAt: at("2026-09-24T09:00:30+07:00"), offerId: "of1" }),
        msg({ createdAt: at("2026-09-24T09:01:00+07:00"), meetupProposalId: "mp1" }),
        msg({ createdAt: at("2026-09-24T09:01:30+07:00") }),
      ],
      now
    );
    expect(groupsOf(rows)).toBe("[x][x][x][x]");
  });

  it("ไม่มีข้อความเลย = ไม่มีแถวอะไรเลย", () => {
    expect(buildChatRows([], now)).toEqual([]);
  });
});
