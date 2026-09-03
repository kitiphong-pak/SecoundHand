-- Migration 013: ข้อความติดต่อระหว่างผู้ใช้กับทีมผู้ดูแล (เมนู "ข้อความ" ในหน้าแอดมิน)
-- เหตุผล: เดิมผู้ใช้ติดต่อผู้ดูแลไม่ได้เลย มีแต่แชทระหว่างผู้ซื้อ-ผู้ขายเกี่ยวกับสินค้าหนึ่งชิ้น
-- (chat_messages ผูกกับ product_id เสมอ) ซึ่งใช้กับเคสนี้ไม่ได้ เลยแยกตารางใหม่
--
-- โครงสร้างต่างจากแชทสินค้าตรงที่ห้องสนทนาระบุด้วย user_id เดียว (ผู้ใช้คนนั้นคุยกับ "ทีม
-- ผู้ดูแล" ไม่ใช่กับแอดมินคนใดคนหนึ่ง) เลยไม่ต้องมีตารางสรุปห้องแยกแบบ chat_threads —
-- ใช้ group by user_id เอาผ่านฟังก์ชัน admin_support_threads() ด้านล่างพอ เพราะปริมาณ
-- ข้อความติดต่อผู้ดูแลน้อยกว่าแชทซื้อขายมาก
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

-- ใช้ if not exists ทุกจุดเพื่อให้รันซ้ำได้ปลอดภัย เผื่อรอบก่อนรันไปได้แค่บางส่วนแล้วค้าง
create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  from_admin boolean not null default false,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_messages_user on support_messages(user_id, created_at);
create index if not exists idx_support_messages_unread on support_messages(user_id, from_admin, read);

alter table support_messages enable row level security;

-- รายการห้องสนทนาทั้งหมดสำหรับหน้า /admin/messages — คืนผู้ใช้ที่เคยติดต่อเข้ามา พร้อม
-- ข้อความล่าสุดและจำนวนที่แอดมินยังไม่ได้อ่าน เรียงตามข้อความล่าสุดก่อน
-- ชื่อคอลัมน์ผลลัพธ์ต้องไม่ชนกับชื่อคอลัมน์ของตารางที่ query อยู่ (เช่น user_id ใน
-- support_messages) เพราะ Postgres มองชื่อใน returns table เป็น OUT parameter ที่อยู่ใน
-- ขอบเขตเดียวกับคอลัมน์ในบอดี้ แล้วจะฟ้อง "column reference is ambiguous" จนสร้างฟังก์ชันไม่ผ่าน
create or replace function admin_support_threads()
returns table (
  thread_user_id uuid,
  thread_user_name text,
  thread_user_email text,
  last_text text,
  last_at timestamptz,
  unread_for_admin bigint
)
language sql
stable
as $$
  select
    m.user_id,
    u.name,
    u.email,
    (array_agg(m.text order by m.created_at desc))[1],
    max(m.created_at),
    count(*) filter (where m.from_admin = false and m.read = false)
  from support_messages m
  join users u on u.id = m.user_id
  group by m.user_id, u.name, u.email
  order by max(m.created_at) desc;
$$;

-- จำนวนห้องที่มีข้อความใหม่รอแอดมินอ่าน — ใช้ทำ badge ตัวเลขข้างเมนู "ข้อความ"
create or replace function admin_support_unread_count()
returns bigint
language sql
stable
as $$
  select count(distinct user_id)
  from support_messages
  where from_admin = false and read = false;
$$;
