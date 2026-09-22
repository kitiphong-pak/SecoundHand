import { supabase } from "../src/lib/supabase";
import { SYSTEM_USER_ID } from "../src/lib/systemUser";

// ย้ายผู้ใช้เดิมจากระบบ auth ที่เขียนเอง ไปเป็นบัญชีใน Supabase Auth — รันครั้งเดียวหลัง migration 018
//
// ใช้ id เดิม และ hash รหัสผ่านเดิม (bcrypt ซึ่ง Supabase Auth รับนำเข้าได้ตรงๆ) — ผู้ใช้ทุกคน
// ล็อกอินด้วยรหัสผ่านเดิมได้ทันที ไม่ต้องตั้งใหม่ และข้อมูลที่อ้าง id เดิม (สินค้า ออเดอร์ แชท
// รีวิว) ไม่ต้องแก้สักแถว
//
// ใช้:
//   npm run auth:migrate-users            ← ดูอย่างเดียวว่าจะย้ายใครบ้าง ไม่แก้อะไร
//   npm run auth:migrate-users -- --apply ← ย้ายจริง
//
// รันซ้ำได้ปลอดภัย: ย้ายเสร็จแล้วจะล้าง password_hash ของคนนั้นเป็น null รอบถัดไปจะข้ามไปเอง
// ถ้าหลุดกลางทาง (สร้างใน Auth แล้วแต่ยังไม่ได้ล้าง hash) รอบถัดไปจะเจอว่ามีบัญชี id นี้อยู่แล้ว
// ก็แค่ล้าง hash ต่อให้จบ
//
// ปลายทางคือโปรเจกต์ Supabase ตาม NEXT_PUBLIC_SUPABASE_URL ใน .env ซึ่งตอนนี้คือ UAT

const apply = process.argv.includes("--apply");

async function main() {
  const { data: rows, error } = await supabase
    .from("users")
    .select("id, email, password_hash")
    .not("password_hash", "is", null)
    .neq("id", SYSTEM_USER_ID) // บัญชีระบบตั้งใจให้ไม่มีตัวตนใน Auth จะได้ล็อกอินไม่ได้เลย
    .order("created_at");
  if (error) throw error;

  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;
  console.log(`ปลายทาง: ${host}`);
  console.log(`ผู้ใช้ที่ยังไม่ได้ย้าย: ${rows.length} คน`);
  if (!apply) {
    for (const r of rows) console.log(`  - ${r.email}`);
    console.log("\nโหมดดูอย่างเดียว ยังไม่ได้แก้อะไร — ใส่ -- --apply เพื่อย้ายจริง");
    return;
  }

  let moved = 0;
  let resumed = 0;
  const failed: string[] = [];

  for (const r of rows) {
    const { error: createErr } = await supabase.auth.admin.createUser({
      id: r.id,
      email: r.email,
      password_hash: r.password_hash,
      email_confirm: true,
    });

    if (createErr) {
      // มีบัญชีอยู่แล้ว — ถ้าเป็น id เดียวกันแปลว่ารอบก่อนสร้างสำเร็จแต่หลุดก่อนล้าง hash ทำต่อได้
      // ถ้าเป็นคนละ id แปลว่ามีคนอื่นใช้อีเมลนี้ใน Auth อยู่ ห้ามแตะ ให้คนดูเอง
      const { data: existing } = await supabase.auth.admin.getUserById(r.id);
      if (!existing?.user) {
        failed.push(`${r.email} (${createErr.code ?? createErr.message})`);
        continue;
      }
      resumed++;
    } else {
      moved++;
    }

    // ล้าง hash ออกจากตารางของเรา — รหัสผ่านอยู่ที่ Supabase Auth ที่เดียวแล้ว เก็บซ้ำไว้สองที่
    // มีแต่เพิ่มโอกาสรั่ว
    const { error: clearErr } = await supabase.from("users").update({ password_hash: null }).eq("id", r.id);
    if (clearErr) failed.push(`${r.email} (ย้ายแล้วแต่ล้าง hash ไม่สำเร็จ: ${clearErr.message})`);
  }

  console.log(`\nย้ายใหม่ ${moved} คน, ทำต่อจากรอบก่อน ${resumed} คน, ไม่สำเร็จ ${failed.length} คน`);
  for (const f of failed) console.log(`  ✗ ${f}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
