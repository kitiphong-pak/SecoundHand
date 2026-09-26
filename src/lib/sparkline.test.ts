import { describe, it, expect } from "vitest";
import { buildSparkline, bucketDaily } from "./sparkline";

describe("buildSparkline", () => {
  it("คืนขนาด default 120x32 เมื่อไม่ระบุ opts", () => {
    const g = buildSparkline([1, 2, 3]);
    expect(g.width).toBe(120);
    expect(g.height).toBe(32);
  });

  it("linePath ต้องเริ่มด้วย M (moveto) เสมอ และมีจำนวนจุดเท่ากับข้อมูล", () => {
    const g = buildSparkline([5, 1, 8, 3]);
    expect(g.linePath.startsWith("M")).toBe(true);
    // นับจำนวนคำสั่ง M/L ว่าตรงกับจำนวนค่าที่ส่งเข้าไป (4 ค่า = M ตัวแรก + L อีก 3 ตัว)
    const commandCount = (g.linePath.match(/[ML]/g) ?? []).length;
    expect(commandCount).toBe(4);
  });

  it("areaPath ปิดเป็นรูปหลายเหลี่ยม (จบด้วย Z)", () => {
    const g = buildSparkline([1, 2, 3]);
    expect(g.areaPath.endsWith("Z")).toBe(true);
  });

  it("ค่าทั้งหมดเป็น 0 (วันเงียบ) ต้องไม่ error หรือได้ NaN ในพิกัด", () => {
    const g = buildSparkline([0, 0, 0, 0]);
    expect(g.linePath).not.toContain("NaN");
    expect(g.areaPath).not.toContain("NaN");
  });

  it("มีค่าเดียว (values.length === 1) ต้องไม่หารด้วยศูนย์จน error", () => {
    const g = buildSparkline([5]);
    expect(g.linePath).not.toContain("NaN");
    expect(g.lastX).toBeCloseTo(3, 0); // pad เริ่มต้น
  });
});

describe("bucketDaily", () => {
  const today = new Date();
  const isoDaysAgo = (n: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString();
  };

  it("คืน array ยาวเท่ากับ days ที่ระบุเสมอ", () => {
    const buckets = bucketDaily([], 14, (r: { at: string }) => r.at);
    expect(buckets).toHaveLength(14);
    expect(buckets.every((v) => v === 0)).toBe(true);
  });

  it("ข้อมูลของวันนี้ต้องตกอยู่ใน bucket สุดท้าย (index = days - 1)", () => {
    const rows = [{ at: isoDaysAgo(0) }];
    const buckets = bucketDaily(rows, 7, (r) => r.at);
    expect(buckets[6]).toBe(1);
    expect(buckets.slice(0, 6).every((v) => v === 0)).toBe(true);
  });

  it("ข้อมูลของ 6 วันก่อนต้องตกอยู่ใน bucket แรก (index = 0) เมื่อ days = 7", () => {
    const rows = [{ at: isoDaysAgo(6) }];
    const buckets = bucketDaily(rows, 7, (r) => r.at);
    expect(buckets[0]).toBe(1);
  });

  it("ข้อมูลเก่ากว่าช่วงที่ขอ (เกิน days วัน) ต้องถูกทิ้งไป ไม่โผล่ใน bucket ไหนเลย", () => {
    const rows = [{ at: isoDaysAgo(30) }];
    const buckets = bucketDaily(rows, 7, (r) => r.at);
    expect(buckets.every((v) => v === 0)).toBe(true);
  });

  it("getValue กำหนดเองได้ (เช่นบวกยอดเงินแทนการนับจำนวนแถว)", () => {
    const rows = [
      { at: isoDaysAgo(0), amount: 100 },
      { at: isoDaysAgo(0), amount: 250 },
    ];
    const buckets = bucketDaily(rows, 3, (r) => r.at, (r) => r.amount);
    expect(buckets[2]).toBe(350);
  });

  it("ไม่ระบุ getValue ต้องนับจำนวนแถวเป็นค่าเริ่มต้น (ค่าละ 1)", () => {
    const rows = [{ at: isoDaysAgo(0) }, { at: isoDaysAgo(0) }, { at: isoDaysAgo(0) }];
    const buckets = bucketDaily(rows, 3, (r) => r.at);
    expect(buckets[2]).toBe(3);
  });
});
