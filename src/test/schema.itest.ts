import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, migrationFiles, type TestDb } from "@/test/pgContainer";

// เทสชั้นกลาง — Postgres จริงในคอนเทนเนอร์ ไม่ใช่ mock
//
// เทสอีก 187 ข้อในโปรเจคนี้เป็นแบบ mock ทั้งหมด ซึ่งตอบได้แค่ว่า "ถ้าฐานข้อมูลตอบแบบนี้
// โค้ดตัดสินใจถูกไหม" ไม่ได้ตอบว่าฐานข้อมูลตอบแบบนั้นจริงหรือเปล่า ไฟล์นี้ปิดช่องว่างตรงนั้น:
// SQL ทุกบรรทัดใน supabase/migrations ถูกรันจริงกับ Postgres จริง
//
// การที่ beforeAll ผ่านได้ = ไฟล์ migration ทั้งหมดรันผ่านจากฐานข้อมูลเปล่าเรียงตามลำดับ
// ซึ่งเป็นสิ่งที่ทำให้ migration 013 พังไปครึ่งวันเพราะชื่อคอลัมน์ชนกัน
let db: TestDb;

beforeAll(async () => {
  db = await startTestDb();
}, 180_000);

afterAll(async () => {
  await db?.stop();
});

const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) =>
  (await db.client.query(sql, args)).rows as T[];

describe("ไฟล์ migration", () => {
  it("รันครบทุกไฟล์จากฐานข้อมูลเปล่าได้", async () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
    const [{ n }] = await q<{ n: string }>(
      `select count(*) n from information_schema.tables where table_schema = 'public'`
    );
    expect(Number(n)).toBeGreaterThan(5);
  });

  it("สร้างตารางหลักครบ", async () => {
    const rows = await q<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`
    );
    const names = rows.map((r) => r.tablename);
    for (const t of [
      "users",
      "sessions",
      "products",
      "orders",
      "reviews",
      "chat_messages",
      "chat_threads",
      "audit_logs",
      "support_messages",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("เปิด RLS ให้ทุกตารางใน public schema", async () => {
    const unprotected = await q<{ relname: string }>(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`
    );
    expect(unprotected.map((r) => r.relname)).toEqual([]);
  });

  it("orders มีคอลัมน์เวลาครบทุกขั้นตอน รวม paid_at ที่เพิ่งเพิ่ม", async () => {
    const rows = await q<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'orders'`
    );
    const cols = rows.map((r) => r.column_name);
    for (const c of [
      "paid_at",
      "seller_marked_delivered_at",
      "buyer_confirmed_at",
      "completed_at",
      "dispute_opened_at",
      "cancelled_at",
    ]) {
      expect(cols).toContain(c);
    }
  });
});

describe("index กันขายสินค้าชิ้นเดียวซ้ำ (migration 008)", () => {
  it("ปฏิเสธออเดอร์ที่ยังไม่จบใบที่สองของสินค้าเดียวกันที่ระดับฐานข้อมูล", async () => {
    await db.truncateAll();
    const [seller] = await q<{ id: string }>(
      `insert into users (name, email, password_hash, province) values ('ผู้ขาย','s@x.com','h','เชียงใหม่') returning id`
    );
    const [buyerA] = await q<{ id: string }>(
      `insert into users (name, email, password_hash, province) values ('ผู้ซื้อ A','a@x.com','h','เชียงใหม่') returning id`
    );
    const [buyerB] = await q<{ id: string }>(
      `insert into users (name, email, password_hash, province) values ('ผู้ซื้อ B','b@x.com','h','เชียงใหม่') returning id`
    );
    const [product] = await q<{ id: string }>(
      `insert into products (seller_id, title, description, price, category, condition, province)
       values ($1,'จักรยาน','ดี',3500,'กีฬา','good','เชียงใหม่') returning id`,
      [seller.id]
    );

    await q(
      `insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,'pending_payment',3500)`,
      [product.id, buyerA.id, seller.id]
    );

    // ใบที่สองต้องถูกฐานข้อมูลปฏิเสธ ต่อให้โค้ดฝั่งแอปพลาดปล่อยผ่านมาถึงตรงนี้
    await expect(
      q(
        `insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,'pending_payment',3500)`,
        [product.id, buyerB.id, seller.id]
      )
    ).rejects.toThrow();
  });

  it("แต่ยอมให้สั่งซื้อใหม่ได้ ถ้าใบเดิมถูกยกเลิกไปแล้ว", async () => {
    await db.truncateAll();
    const [seller] = await q<{ id: string }>(
      `insert into users (name, email, password_hash, province) values ('ผู้ขาย','s@x.com','h','เชียงใหม่') returning id`
    );
    const [buyer] = await q<{ id: string }>(
      `insert into users (name, email, password_hash, province) values ('ผู้ซื้อ','a@x.com','h','เชียงใหม่') returning id`
    );
    const [product] = await q<{ id: string }>(
      `insert into products (seller_id, title, description, price, category, condition, province)
       values ($1,'จักรยาน','ดี',3500,'กีฬา','good','เชียงใหม่') returning id`,
      [seller.id]
    );
    await q(
      `insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,'cancelled',3500)`,
      [product.id, buyer.id, seller.id]
    );

    await expect(
      q(
        `insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,'pending_payment',3500)`,
        [product.id, buyer.id, seller.id]
      )
    ).resolves.toBeDefined();
  });
});
