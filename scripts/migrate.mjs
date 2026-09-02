// ตัวรัน migration อัตโนมัติ — แทนการ copy-paste SQL เข้า Supabase Dashboard ทีละไฟล์
//
// ทำไมต้องมี: การรันมือทำให้ไม่มีใครรู้ว่าฐานข้อมูลตัวไหนรันไปถึงไฟล์ไหนแล้ว และถ้าไฟล์รัน
// ไปได้ครึ่งเดียวแล้วพัง (เช่น 013 ที่ฟังก์ชันสร้างไม่ผ่านเพราะชื่อคอลัมน์ชนกัน) ตารางที่สร้าง
// สำเร็จไปแล้วจะค้างอยู่ ส่วนที่เหลือหาย แล้วเราไม่รู้เลยว่าค้างตรงไหน
//
// ตัวนี้แก้ทั้งสองเรื่อง: จดว่ารันไฟล์ไหนไปแล้วในตาราง schema_migrations และห่อทุกไฟล์ด้วย
// transaction — พังเมื่อไหร่ย้อนกลับทั้งไฟล์ ไม่มีสภาพครึ่งๆ กลางๆ
//
// วิธีใช้:
//   npm run migrate:status     ดูว่าไฟล์ไหนรันแล้ว/ยังไม่ได้รัน (ไม่แก้อะไรทั้งนั้น)
//   npm run migrate            รันเฉพาะไฟล์ที่ยังไม่เคยรัน
//   npm run migrate:baseline   จดว่าไฟล์ทั้งหมดรันไปแล้ว โดยไม่รันจริง
//
// baseline ใช้ครั้งเดียวตอนเริ่มใช้เครื่องมือนี้กับฐานข้อมูลที่รัน migration ด้วยมือมาก่อน
// ถ้าไม่ทำ ตัวรันจะพยายามรันไฟล์ 002-013 ซ้ำกับฐานข้อมูลที่มีของพวกนั้นอยู่แล้ว

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");

const mode = process.argv[2] ?? "up";
if (!["up", "status", "baseline"].includes(mode)) {
  console.error(`โหมดไม่ถูกต้อง: ${mode} (ต้องเป็น up, status หรือ baseline)`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    [
      "ไม่พบ DATABASE_URL",
      "",
      "หาได้จาก Supabase Dashboard > Project Settings > Database > Connection string > URI",
      "แล้วใส่ลงไฟล์ .env เป็นบรรทัด DATABASE_URL=postgresql://...",
      "",
      "ใช้ค่าของ environment ที่ต้องการรันด้วย — ถ้าจะรันกับ UAT ก็ต้องเป็น URL ของ UAT",
    ].join("\n")
  );
  process.exit(1);
}

// อ่านไฟล์ .sql ทั้งหมดแล้วเรียงตามชื่อ ซึ่งเท่ากับเรียงตามเลขนำหน้า (002, 003, ...)
// ลำดับสำคัญมาก เพราะไฟล์หลังมักอ้างถึงตารางที่ไฟล์ก่อนหน้าสร้างไว้
function readMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      return { filename, sql, checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16) };
    });
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  // ตารางนี้คือสมุดบันทึกว่ารันอะไรไปแล้ว เก็บ checksum ไว้ด้วยเพื่อจับกรณีที่มีคนแก้ไฟล์เก่า
  // ที่รันไปแล้ว ซึ่งเป็นสิ่งต้องห้าม เพราะฐานข้อมูลที่รันไฟล์เวอร์ชันเดิมไปแล้วจะไม่เปลี่ยนตาม
  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows: appliedRows } = await client.query("select filename, checksum from schema_migrations");
  const applied = new Map(appliedRows.map((r) => [r.filename, r.checksum]));
  const migrations = readMigrations();

  const changed = migrations.filter((m) => applied.has(m.filename) && applied.get(m.filename) !== m.checksum);
  if (changed.length > 0) {
    console.error("ไฟล์ที่รันไปแล้วถูกแก้ไขภายหลัง — ห้ามทำ ให้สร้างไฟล์ใหม่เลขถัดไปแทน:");
    for (const m of changed) console.error(`  ${m.filename}`);
    console.error("\nถ้าแก้แค่คอมเมนต์และแน่ใจว่า SQL ไม่เปลี่ยน ให้อัปเดต checksum ด้วย migrate:baseline");
    process.exit(1);
  }

  const pending = migrations.filter((m) => !applied.has(m.filename));

  if (mode === "status") {
    console.log(`ฐานข้อมูล: ${new URL(connectionString).host}\n`);
    for (const m of migrations) {
      console.log(`  ${applied.has(m.filename) ? "[รันแล้ว]  " : "[รอรัน]    "} ${m.filename}`);
    }
    console.log(`\nรวม ${migrations.length} ไฟล์ — รอรัน ${pending.length} ไฟล์`);
    process.exit(0);
  }

  if (mode === "baseline") {
    for (const m of migrations) {
      await client.query(
        `insert into schema_migrations (filename, checksum) values ($1, $2)
         on conflict (filename) do update set checksum = excluded.checksum`,
        [m.filename, m.checksum]
      );
    }
    console.log(`จดไว้แล้วว่า ${migrations.length} ไฟล์รันไปแล้ว (ไม่ได้รัน SQL จริง)`);
    process.exit(0);
  }

  if (pending.length === 0) {
    console.log("ไม่มีไฟล์ที่ต้องรัน — ฐานข้อมูลเป็นเวอร์ชันล่าสุดแล้ว");
    process.exit(0);
  }

  console.log(`ฐานข้อมูล: ${new URL(connectionString).host}`);
  console.log(`ต้องรัน ${pending.length} ไฟล์\n`);

  for (const m of pending) {
    process.stdout.write(`  ${m.filename} ... `);
    // ทั้งไฟล์อยู่ใน transaction เดียว — ถ้าคำสั่งไหนพัง ทุกอย่างในไฟล์นั้นย้อนกลับหมด
    // ไม่เหลือสภาพครึ่งๆ ที่ตารางถูกสร้างแต่ฟังก์ชันไม่ถูกสร้าง
    await client.query("begin");
    try {
      await client.query(m.sql);
      await client.query("insert into schema_migrations (filename, checksum) values ($1, $2)", [
        m.filename,
        m.checksum,
      ]);
      await client.query("commit");
      console.log("สำเร็จ");
    } catch (err) {
      await client.query("rollback");
      console.log("ล้มเหลว");
      console.error(`\n${m.filename} รันไม่ผ่าน ย้อนกลับทั้งไฟล์แล้ว ฐานข้อมูลไม่ถูกแก้:\n`);
      console.error(err.message);
      if (err.hint) console.error(`คำแนะนำจาก Postgres: ${err.hint}`);
      process.exit(1);
    }
  }

  console.log(`\nเสร็จแล้ว — รันไป ${pending.length} ไฟล์`);
} finally {
  await client.end();
}
