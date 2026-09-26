import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

// Supabase มีของที่ Postgres เปล่าไม่มี และไฟล์ migration ของเราอ้างถึงอยู่ — สร้างขึ้นมาให้พอใช้
// ก่อนรัน migration จริง ตรงนี้คือส่วนที่ "ไม่เหมือนของจริง" ที่ต้องรู้ตัวไว้: เราจำลอง storage.buckets
// กับ role ของ PostgREST เท่านั้น ไม่ได้จำลองพฤติกรรมทั้งหมดของ Supabase
const SUPABASE_SHIM = `
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    created_at timestamptz not null default now()
  );
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
`;

export interface TestDb {
  client: pg.Client;
  /** ล้างข้อมูลทุกตารางแต่คงโครงสร้างไว้ ใช้ระหว่างเทสแต่ละข้อ */
  truncateAll(): Promise<void>;
  stop(): Promise<void>;
}

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * ปลุก Postgres ใหม่เอี่ยมในคอนเทนเนอร์ แล้วรันไฟล์ migration ทุกไฟล์ตามลำดับจริง
 * ถ้าไฟล์ไหนรันไม่ผ่าน จะโยน error พร้อมชื่อไฟล์ ซึ่งคือคุณค่าหลักของเทสชุดนี้
 */
export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:17-alpine").start();
  const client = new pg.Client({ connectionString: container.getConnectionUri() });
  await client.connect();

  await client.query(SUPABASE_SHIM);

  for (const filename of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`migration ${filename} รันไม่ผ่าน: ${message}`);
    }
  }

  return {
    client,
    async truncateAll() {
      const { rows } = await client.query(
        `select tablename from pg_tables where schemaname = 'public'`
      );
      const names = rows.map((r) => `public."${r.tablename}"`).join(", ");
      if (names) await client.query(`truncate ${names} restart identity cascade`);
    },
    async stop() {
      await client.end();
      await container.stop();
    },
  };
}
