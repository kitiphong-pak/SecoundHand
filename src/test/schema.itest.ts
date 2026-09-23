import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

  // migration 020: โครงสร้างของ flow นัดเจอ — คอลัมน์ต้องพร้อมก่อนโค้ดของ 1b/1c จะมาใช้
  it("orders มีคอลัมน์ของการนัดเจอและการยกเลิกครบ (migration 020)", async () => {
    const rows = await q<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'orders'`
    );
    const cols = rows.map((r) => r.column_name);
    for (const c of [
      "meetup_at",
      "meetup_place",
      "meetup_proposed_by",
      "meetup_confirmed_at",
      "seller_confirmed_at",
      "cancelled_by",
      "cancel_reason",
    ]) {
      expect(cols).toContain(c);
    }
  });

  it("รับเฉพาะสถานะของ flow ใหม่ สถานะที่เลิกใช้แล้วต้องเขียนลงไม่ได้", async () => {
    await db.truncateAll();
    const [seller] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('ผู้ขาย','s@x.com','เชียงใหม่') returning id`
    );
    const [buyer] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('ผู้ซื้อ','b@x.com','เชียงใหม่') returning id`
    );
    const newProduct = async () => {
      const [p] = await q<{ id: string }>(
        `insert into products (seller_id, title, description, price, category, condition, province)
         values ($1,'ของ','ดี',100,'อื่นๆ','good','เชียงใหม่') returning id`,
        [seller.id]
      );
      return p.id;
    };

    for (const status of [
      "reserved",
      "meetup_scheduled",
      "awaiting_buyer_confirmation",
      "completed",
      "cancelled",
    ]) {
      await expect(
        q(`insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,$4,100)`, [
          await newProduct(),
          buyer.id,
          seller.id,
          status,
        ])
      ).resolves.toBeDefined();
    }

    // สถานะของ flow เก่า (มีเงินผ่านระบบ + OTP + ข้อพิพาท) ต้องเขียนลงไม่ได้อีกแล้ว ไม่งั้นโค้ดเก่า
    // ที่หลงเหลืออยู่จะพาออเดอร์ไปติดอยู่ในสถานะที่ไม่มีหน้าจอไหนพาต่อได้
    for (const status of ["pending_payment", "paid", "awaiting_otp_entry", "disputed"]) {
      await expect(
        q(`insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,$4,100)`, [
          await newProduct(),
          buyer.id,
          seller.id,
          status,
        ])
      ).rejects.toThrow();
    }

    // สถานะที่ไม่รู้จักต้องถูกปฏิเสธที่ฐานข้อมูล ไม่ใช่รอให้โค้ดเช็คเอง
    await expect(
      q(`insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,'ขายแล้วมั้ง',100)`, [
        await newProduct(),
        buyer.id,
        seller.id,
      ])
    ).rejects.toThrow();
  });

  it("cancel_reason รับเฉพาะค่าที่กำหนดไว้ (migration 020)", async () => {
    await db.truncateAll();
    const [seller] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('ผู้ขาย','s@x.com','เชียงใหม่') returning id`
    );
    const [buyer] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('ผู้ซื้อ','b@x.com','เชียงใหม่') returning id`
    );
    const [product] = await q<{ id: string }>(
      `insert into products (seller_id, title, description, price, category, condition, province)
       values ($1,'ของ','ดี',100,'อื่นๆ','good','เชียงใหม่') returning id`,
      [seller.id]
    );

    await expect(
      q(
        `insert into orders (product_id, buyer_id, seller_id, status, amount, cancel_reason)
         values ($1,$2,$3,'cancelled',100,'no_show_buyer')`,
        [product.id, buyer.id, seller.id]
      )
    ).resolves.toBeDefined();

    await expect(
      q(
        `insert into orders (product_id, buyer_id, seller_id, status, amount, cancel_reason)
         values ($1,$2,$3,'cancelled',100,'เพราะอยากยกเลิก')`,
        [product.id, buyer.id, seller.id]
      )
    ).rejects.toThrow();
  });

  // migration 018 + 019: รหัสผ่านอยู่ที่ Supabase Auth ที่เดียว ของเดิมในตารางเราต้องหายไปหมด
  it("ไม่เหลือตาราง sessions และคอลัมน์ users.password_hash แล้ว (migration 019)", async () => {
    const [{ sessions }] = await q<{ sessions: string | null }>(`select to_regclass('public.sessions') as sessions`);
    expect(sessions).toBeNull();

    const cols = await q<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'users'`
    );
    expect(cols.map((c) => c.column_name)).not.toContain("password_hash");
  });

  it("สร้างผู้ใช้ได้ด้วยข้อมูลโปรไฟล์อย่างเดียว ไม่มีช่องรหัสผ่าน", async () => {
    await db.truncateAll();
    await expect(
      q(
        `insert into users (id, name, email, province) values (gen_random_uuid(), 'ผู้ใช้ใหม่', 'new@x.com', 'เชียงใหม่')`
      )
    ).resolves.toBeDefined();
  });

  // ด่านกันพลาดของ 019: ถ้ายังมีผู้ใช้ที่ไม่ได้ย้ายเข้า Supabase Auth (ยังมี hash อยู่) ต้องล้มทั้งไฟล์
  // ไม่งั้นลบคอลัมน์ไปแล้ว hash ของคนพวกนั้นหายถาวร ล็อกอินไม่ได้อีกเลย
  // ทดสอบโดยสร้างคอลัมน์คืนชั่วคราว แล้วรันเฉพาะส่วนตรวจของไฟล์ 019 ซ้ำ
  describe("ด่านกันพลาดของ migration 019", () => {
    const guard = () => {
      const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "019_drop_legacy_auth.sql"), "utf8");
      const block = sql.match(/do \$\$[\s\S]*?end \$\$;/);
      if (!block) throw new Error("หาส่วนตรวจใน 019 ไม่เจอ");
      return q(block[0]);
    };

    beforeAll(async () => {
      await q(`alter table users add column password_hash text`);
    });
    afterAll(async () => {
      await q(`alter table users drop column if exists password_hash`);
    });

    it("ยังมีผู้ใช้จริงที่มี hash → ปฏิเสธ พร้อมบอกจำนวนคน", async () => {
      await db.truncateAll();
      await q(`insert into users (name, email, province, password_hash) values ('ยังไม่ย้าย','old@x.com','เชียงใหม่','$2b$10$x')`);
      await expect(guard()).rejects.toThrow(/ยังมีผู้ใช้ 1 คน/);
    });

    it("มีแค่บัญชีระบบที่ยังมี hash → ผ่าน (บัญชีนี้ตั้งใจไม่ย้าย)", async () => {
      await db.truncateAll();
      await q(
        `insert into users (id, name, email, province, password_hash)
         values ('00000000-0000-0000-0000-000000000001','ระบบ','system@x.com','กรุงเทพมหานคร','$2b$10$x')`
      );
      await expect(guard()).resolves.toBeDefined();
    });
  });
});

describe("index กันขายสินค้าชิ้นเดียวซ้ำ (migration 008)", () => {
  it("ปฏิเสธออเดอร์ที่ยังไม่จบใบที่สองของสินค้าเดียวกันที่ระดับฐานข้อมูล", async () => {
    await db.truncateAll();
    const [seller] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('ผู้ขาย','s@x.com','เชียงใหม่') returning id`
    );
    const [buyerA] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('ผู้ซื้อ A','a@x.com','เชียงใหม่') returning id`
    );
    const [buyerB] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('ผู้ซื้อ B','b@x.com','เชียงใหม่') returning id`
    );
    const [product] = await q<{ id: string }>(
      `insert into products (seller_id, title, description, price, category, condition, province)
       values ($1,'จักรยาน','ดี',3500,'กีฬา','good','เชียงใหม่') returning id`,
      [seller.id]
    );

    await q(
      `insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,'reserved',3500)`,
      [product.id, buyerA.id, seller.id]
    );

    // ใบที่สองต้องถูกฐานข้อมูลปฏิเสธ ต่อให้โค้ดฝั่งแอปพลาดปล่อยผ่านมาถึงตรงนี้
    await expect(
      q(
        `insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,'reserved',3500)`,
        [product.id, buyerB.id, seller.id]
      )
    ).rejects.toThrow();
  });

  it("แต่ยอมให้สั่งซื้อใหม่ได้ ถ้าใบเดิมถูกยกเลิกไปแล้ว", async () => {
    await db.truncateAll();
    const [seller] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('ผู้ขาย','s@x.com','เชียงใหม่') returning id`
    );
    const [buyer] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('ผู้ซื้อ','a@x.com','เชียงใหม่') returning id`
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
        `insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,'reserved',3500)`,
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
    `insert into users (name, email, province) values ('ผู้ขาย','s@x.com','เชียงใหม่') returning id`
  );
  const [buyer] = await q<{ id: string }>(
    `insert into users (name, email, province) values ('ผู้ซื้อ','b@x.com','เชียงใหม่') returning id`
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
      `insert into users (name, email, province) values ('คนนอก','x@x.com','เชียงใหม่') returning id`
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

// ---- การนัดเจอ (migration 023) ----
//
// ชั้นนี้เทสด้วย mock ไม่ได้เหมือนกัน เพราะทั้งการทับข้อเสนอเก่า การกันคนเสนอกดยืนยันเอง และการ
// เขียนนัดที่ตกลงแล้วลงออเดอร์ อยู่ใน plpgsql ทั้งหมด — ฝั่ง TypeScript เห็นแค่ "คืนแถวมาหรือเปล่า"
async function seedOrder(status = "reserved") {
  const { sellerId, buyerId, productId } = await seedPair();
  const [order] = await q<{ id: string }>(
    `insert into orders (product_id, buyer_id, seller_id, status, amount) values ($1,$2,$3,$4,1000) returning id`,
    [productId, buyerId, sellerId, status]
  );
  return { sellerId, buyerId, productId, orderId: order.id };
}

type ProposalRow = {
  id: string;
  status: string;
  meetup_at: string;
  place: string;
  proposed_by: string;
};

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const proposeMeetup = (orderId: string, from: string, at: string | null, place: string) =>
  q<ProposalRow>(`select * from propose_meetup($1,$2,$3,$4)`, [orderId, from, at, place]);

const respondMeetup = (proposalId: string, responder: string, accept: boolean) =>
  q<ProposalRow>(`select * from respond_meetup($1,$2,$3)`, [proposalId, responder, accept]);

const orderOf = async (orderId: string) =>
  (
    await q<{ status: string; meetup_at: string | null; meetup_place: string | null; meetup_confirmed_at: string | null; meetup_proposed_by: string | null }>(
      `select status, meetup_at, meetup_place, meetup_confirmed_at, meetup_proposed_by from orders where id = $1`,
      [orderId]
    )
  )[0];

describe("นัดเจอในแชท (migration 023)", () => {
  it("เสนอนัด → ได้ข้อเสนอ pending พร้อมข้อความในแชทที่ผูกกับข้อเสนอนั้น", async () => {
    const { orderId, buyerId, productId } = await seedOrder();
    const [proposal] = await proposeMeetup(orderId, buyerId, tomorrow(), "หน้า BTS อโศก");

    expect(proposal.status).toBe("pending");

    const [msg] = await q<{ text: string; meetup_proposal_id: string; to_user_id: string }>(
      `select text, meetup_proposal_id, to_user_id from chat_messages where product_id = $1`,
      [productId]
    );
    expect(msg.meetup_proposal_id).toBe(proposal.id);
    expect(msg.text).toContain("หน้า BTS อโศก");

    // ห้องแชทต้องขึ้นว่ามีข้อความใหม่ให้อีกฝ่าย ไม่งั้นการ์ดนัดจะเงียบอยู่ในห้องที่ไม่มีใครเปิด
    const [thread] = await q<{ seller_unread_count: number }>(
      `select seller_unread_count from chat_threads where product_id = $1`,
      [productId]
    );
    expect(Number(thread.seller_unread_count)).toBe(1);
  });

  // ข้อเสนอล่าสุดคือสิ่งที่อยู่บนโต๊ะเสมอ — ถ้าอันเก่ายังค้าง pending อยู่ อีกฝ่ายจะกดตอบรับเวลาที่
  // ถูกเปลี่ยนไปแล้วได้ แล้วทั้งคู่จะถือเวลานัดกันคนละเวลา
  it("เสนอเวลาใหม่ทับ → อันเก่ากลายเป็น superseded ไม่ใช่ declined และเหลือ pending อันเดียว", async () => {
    const { orderId, buyerId } = await seedOrder();
    const [first] = await proposeMeetup(orderId, buyerId, tomorrow(), "ที่เดิม");
    await proposeMeetup(orderId, buyerId, tomorrow(), "ที่ใหม่");

    const rows = await q<ProposalRow>(`select * from meetup_proposals where order_id = $1`, [orderId]);
    expect(rows.find((r) => r.id === first.id)!.status).toBe("superseded");
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(1);
  });

  it("อีกฝ่ายตอบรับ → เขียนนัดลงออเดอร์และเลื่อนสถานะเป็น meetup_scheduled", async () => {
    const { orderId, buyerId, sellerId } = await seedOrder();
    const at = tomorrow();
    const [proposal] = await proposeMeetup(orderId, buyerId, at, "หน้าเซเว่นปากซอย");

    const [answered] = await respondMeetup(proposal.id, sellerId, true);
    expect(answered.status).toBe("accepted");

    const order = await orderOf(orderId);
    expect(order.status).toBe("meetup_scheduled");
    expect(new Date(order.meetup_at!).toISOString()).toBe(new Date(at).toISOString());
    expect(order.meetup_place).toBe("หน้าเซเว่นปากซอย");
    expect(order.meetup_confirmed_at).not.toBeNull();
    expect(order.meetup_proposed_by).toBe(buyerId);
  });

  // ถ้าคนเสนอกดยืนยันนัดของตัวเองได้ คำว่า "ตกลงนัดกันแล้ว" จะไม่ได้แปลว่าอีกฝ่ายรับรู้ด้วยเลย
  // และคะแนนมาตามนัดใน Phase 2 จะปั่นได้ฟรีๆ ด้วยการนัดกับตัวเองรัวๆ
  it("คนเสนอกดยืนยันนัดของตัวเองไม่ได้ และคนนอกก็ตอบแทนไม่ได้", async () => {
    const { orderId, buyerId } = await seedOrder();
    const [stranger] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('คนนอก','x@x.com','เชียงใหม่') returning id`
    );
    const [proposal] = await proposeMeetup(orderId, buyerId, tomorrow(), "ที่ไหนสักแห่ง");

    expect(await respondMeetup(proposal.id, buyerId, true)).toHaveLength(0);
    expect(await respondMeetup(proposal.id, stranger.id, true)).toHaveLength(0);

    const rows = await q<ProposalRow>(`select * from meetup_proposals where id = $1`, [proposal.id]);
    expect(rows[0].status).toBe("pending");
    expect((await orderOf(orderId)).status).toBe("reserved");
  });

  it("ตอบข้อเสนอเดิมซ้ำครั้งที่สองไม่ได้ (compare-and-swap)", async () => {
    const { orderId, buyerId, sellerId } = await seedOrder();
    const [proposal] = await proposeMeetup(orderId, buyerId, tomorrow(), "ที่หนึ่ง");

    expect(await respondMeetup(proposal.id, sellerId, true)).toHaveLength(1);
    expect(await respondMeetup(proposal.id, sellerId, false)).toHaveLength(0);
  });

  it("ออเดอร์ที่ยกเลิกไปแล้ว เสนอนัดใหม่ไม่ได้ และนัดที่ค้างอยู่ก็ตอบรับไม่ได้", async () => {
    const { orderId, buyerId, sellerId } = await seedOrder();
    const [pending] = await proposeMeetup(orderId, buyerId, tomorrow(), "ที่หนึ่ง");
    await q(`update orders set status = 'cancelled' where id = $1`, [orderId]);

    await expect(proposeMeetup(orderId, buyerId, tomorrow(), "ที่สอง")).rejects.toThrow(/order not open/);
    expect(await respondMeetup(pending.id, sellerId, true)).toHaveLength(0);
    expect((await orderOf(orderId)).status).toBe("cancelled");
  });

  it("คนนอกออเดอร์เสนอนัดไม่ได้ และเวลานัดต้องเป็นอนาคตเสมอ", async () => {
    const { orderId, buyerId } = await seedOrder();
    const [stranger] = await q<{ id: string }>(
      `insert into users (name, email, province) values ('คนนอก','x@x.com','เชียงใหม่') returning id`
    );

    await expect(proposeMeetup(orderId, stranger.id, tomorrow(), "ที่หนึ่ง")).rejects.toThrow(
      /not a party/
    );
    await expect(
      proposeMeetup(orderId, buyerId, new Date(Date.now() - 60_000).toISOString(), "ที่หนึ่ง")
    ).rejects.toThrow(/future/);
  });
});

// ---- นัดที่ยังไม่ระบุเวลา (migration 024) ----
//
// กติกาที่ต้องพิสูจน์: ออเดอร์จะนับว่า "นัดเจอแล้ว" ก็ต่อเมื่อมีเวลาแล้วเท่านั้น — นัดที่มีแต่สถานที่
// ยังไม่ใช่นัด เพราะไม่มีใครรู้ว่าจะไปเจอกันกี่โมง และ Phase 2 ก็ไม่มีเวลาให้เทียบว่าใครมาสาย
describe("นัดที่ยังไม่ระบุเวลา (migration 024)", () => {
  it("เสนอเฉพาะสถานที่ได้ ตกลงแล้วออเดอร์ได้สถานที่แต่ยังไม่ใช่ meetup_scheduled", async () => {
    const { orderId, buyerId, sellerId } = await seedOrder();
    const [proposal] = await proposeMeetup(orderId, buyerId, null, "หน้าห้างเมญ่า");

    const [answered] = await respondMeetup(proposal.id, sellerId, true);
    expect(answered.status).toBe("accepted");

    const order = await orderOf(orderId);
    expect(order.meetup_place).toBe("หน้าห้างเมญ่า");
    expect(order.meetup_at).toBeNull();
    expect(order.status).toBe("reserved");
  });

  it("พอเคาะเวลาตามมาทีหลังและตกลงกัน ถึงจะเป็น meetup_scheduled", async () => {
    const { orderId, buyerId, sellerId } = await seedOrder();
    const [placeOnly] = await proposeMeetup(orderId, buyerId, null, "หน้าห้างเมญ่า");
    await respondMeetup(placeOnly.id, sellerId, true);

    const at = tomorrow();
    const [withTime] = await proposeMeetup(orderId, sellerId, at, "หน้าห้างเมญ่า");
    await respondMeetup(withTime.id, buyerId, true);

    const order = await orderOf(orderId);
    expect(order.status).toBe("meetup_scheduled");
    expect(new Date(order.meetup_at!).toISOString()).toBe(new Date(at).toISOString());
  });

  // เคสที่พลาดง่ายที่สุด: ย้ายสถานที่นัดอย่างเดียวแล้วเวลาที่ตกลงกันไว้หายไปทั้งที่ไม่มีใครสั่ง
  it("ข้อเสนอที่ไม่มีเวลา ต้องไม่ล้างเวลาที่ตกลงกันไว้แล้ว", async () => {
    const { orderId, buyerId, sellerId } = await seedOrder();
    const at = tomorrow();
    const [first] = await proposeMeetup(orderId, buyerId, at, "ที่เดิม");
    await respondMeetup(first.id, sellerId, true);

    const [movePlace] = await proposeMeetup(orderId, sellerId, null, "ย้ายไปหน้าเซเว่น");
    await respondMeetup(movePlace.id, buyerId, true);

    const order = await orderOf(orderId);
    expect(order.meetup_place).toBe("ย้ายไปหน้าเซเว่น");
    expect(new Date(order.meetup_at!).toISOString()).toBe(new Date(at).toISOString());
    expect(order.status).toBe("meetup_scheduled");
  });
});
