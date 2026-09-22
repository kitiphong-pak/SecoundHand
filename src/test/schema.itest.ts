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

  // migration 018: รหัสผ่านย้ายไปอยู่ใน Supabase Auth ผู้ใช้ที่สมัครใหม่จึงไม่มี hash ในตารางนี้
  // ถ้าคอลัมน์ยังเป็น not null อยู่ การสมัครสมาชิกจะพังทุกครั้งตอนบันทึกโปรไฟล์
  it("สร้างผู้ใช้ได้โดยไม่มี password_hash (migration 018)", async () => {
    await db.truncateAll();
    await expect(
      q(
        `insert into users (id, name, email, province) values (gen_random_uuid(), 'ผู้ใช้ใหม่', 'new@x.com', 'เชียงใหม่')`
      )
    ).resolves.toBeDefined();
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

// ---- การต่อรองราคา (migration 016 + 017) ----
//
// ชั้นนี้เทสด้วย mock ไม่ได้เลย เพราะตรรกะทั้งหมดอยู่ใน plpgsql ฝั่งฐานข้อมูล ไม่ใช่ใน TypeScript
// สิ่งที่ต้องพิสูจน์คือ "ข้อตกลงที่ยังมีผลมีได้ครั้งละหนึ่งเดียว" จริงไหม ต่อให้ยิงตรงเข้า SQL
async function seedPair() {
  await db.truncateAll();
  const [seller] = await q<{ id: string }>(
    `insert into users (name, email, password_hash, province) values ('ผู้ขาย','s@x.com','h','เชียงใหม่') returning id`
  );
  const [buyer] = await q<{ id: string }>(
    `insert into users (name, email, password_hash, province) values ('ผู้ซื้อ','b@x.com','h','เชียงใหม่') returning id`
  );
  const [product] = await q<{ id: string }>(
    `insert into products (seller_id, title, description, price, category, condition, province)
     values ($1,'เก้าอี้','ดี',1000,'เฟอร์นิเจอร์','good','เชียงใหม่') returning id`,
    [seller.id]
  );
  return { sellerId: seller.id, buyerId: buyer.id, productId: product.id };
}

const makeOffer = (productId: string, from: string, to: string, amount: number) =>
  q<{ id: string; status: string }>(
    `select * from create_offer($1,$2,$3,$4)`,
    [productId, from, to, amount]
  );

const accept = (offerId: string, responderId: string) =>
  q(`select * from respond_offer($1,$2,true)`, [offerId, responderId]);

describe("ข้อตกลงราคามีได้ครั้งละหนึ่งเดียว (migration 017)", () => {
  it("เสนอราคาใหม่ไม่ได้ถ้ายังมีข้อตกลงค้างอยู่ — ฟังก์ชันยิง errcode 23001 กลับมา", async () => {
    const { sellerId, buyerId, productId } = await seedPair();
    const [offer] = await makeOffer(productId, buyerId, sellerId, 900);
    await accept(offer.id, sellerId);

    await expect(makeOffer(productId, buyerId, sellerId, 800)).rejects.toThrow(
      /offer_already_accepted/
    );
  });

  // ข้อเสนอต่อรองกลับไปกลับมาได้ ถ้า index ไม่ normalize คู่ด้วย least/greatest ทิศทางที่กลับกัน
  // จะนับเป็นคนละคู่ แล้วมีข้อตกลงค้างพร้อมกันสองอันได้เหมือนเดิม — ข้อนี้คือตัวจับกรณีนั้น
  it("ฐานข้อมูลปฏิเสธข้อตกลงที่สองของคู่เดิม แม้จะสลับทิศทาง from/to", async () => {
    const { sellerId, buyerId, productId } = await seedPair();
    await q(
      `insert into offers (product_id, from_user_id, to_user_id, amount, status)
       values ($1,$2,$3,900,'accepted')`,
      [productId, buyerId, sellerId]
    );

    await expect(
      q(
        `insert into offers (product_id, from_user_id, to_user_id, amount, status)
         values ($1,$2,$3,850,'accepted')`,
        [productId, sellerId, buyerId]
      )
    ).rejects.toThrow();
  });

  it("ยกเลิกข้อตกลงแล้วต่อรองใหม่ได้ และมีข้อความแจ้งในแชทให้อีกฝ่ายเห็น", async () => {
    const { sellerId, buyerId, productId } = await seedPair();
    const [offer] = await makeOffer(productId, buyerId, sellerId, 900);
    await accept(offer.id, sellerId);

    const cancelled = await q<{ status: string }>(
      `select * from cancel_offer_agreement($1,$2)`,
      [offer.id, buyerId]
    );
    expect(cancelled[0].status).toBe("cancelled");

    const msgs = await q<{ text: string }>(
      `select text from chat_messages where product_id = $1 order by created_at`,
      [productId]
    );
    expect(msgs.at(-1)!.text).toContain("ยกเลิกข้อตกลง");

    // พอไม่มีข้อตกลงค้างแล้ว ต้องเสนอราคาใหม่ได้ตามปกติ ไม่ใช่ล็อกตายถาวร
    const [again] = await makeOffer(productId, buyerId, sellerId, 800);
    expect(again.status).toBe("pending");
  });

  it("คนนอกวงสนทนายกเลิกข้อตกลงของคนอื่นไม่ได้", async () => {
    const { sellerId, buyerId, productId } = await seedPair();
    const [stranger] = await q<{ id: string }>(
      `insert into users (name, email, password_hash, province) values ('คนนอก','x@x.com','h','เชียงใหม่') returning id`
    );
    const [offer] = await makeOffer(productId, buyerId, sellerId, 900);
    await accept(offer.id, sellerId);

    const rows = await q(`select * from cancel_offer_agreement($1,$2)`, [offer.id, stranger.id]);
    expect(rows).toEqual([]);

    const [still] = await q<{ status: string }>(`select status from offers where id = $1`, [offer.id]);
    expect(still.status).toBe("accepted");
  });

  it("ข้อเสนอที่ยัง pending ยังถูกแทนที่ด้วยข้อเสนอใหม่ได้เหมือนเดิม (ไม่ได้ล็อกทุกกรณี)", async () => {
    const { sellerId, buyerId, productId } = await seedPair();
    const [first] = await makeOffer(productId, buyerId, sellerId, 900);
    await makeOffer(productId, buyerId, sellerId, 850);

    const [old] = await q<{ status: string }>(`select status from offers where id = $1`, [first.id]);
    expect(old.status).toBe("cancelled");
  });
});
