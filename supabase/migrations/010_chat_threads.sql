-- Migration 010: เพิ่มตาราง chat_threads — 1 แถวต่อ 1 ห้องแชทจริงๆ
-- เหตุผล: หน้า inbox แชท (/api/chat) และ badge นับแชทยังไม่อ่าน (/api/badges) เดิมดึงข้อความ
-- "ทุกข้อความที่เคยส่ง/รับทั้งหมด" ของ user มาทั้งก้อนทุกครั้ง (ถูก poll ทุก 5 วิด้วย) แค่เพื่อ
-- จัดกลุ่มเป็นรายการห้องแชทใน JS — จุดนี้แหละที่จะแย่ลงเรื่อยๆ เมื่อมีข้อความสะสมเยอะขึ้น ไม่ใช่
-- ตัวตาราง chat_messages เอง (เก็บ 1 แถวต่อ 1 ข้อความยังเป็นวิธีที่ถูกต้องอยู่ — ดูเหตุผลที่คุยกัน
-- ในแชทว่าทำไมยุบทุกข้อความไว้แถวเดียวถึงแย่กว่าเดิม)
--
-- ตารางนี้เก็บแค่ "สรุป" ของแต่ละห้องแชท (คู่สนทนา, ข้อความล่าสุด, จำนวนยังไม่อ่านของแต่ละฝั่ง)
-- ไม่ใช่เนื้อข้อความทั้งหมด — หน้า inbox/badge อ่านจากตารางนี้โต๊ะเดียวจบ (query เดียว มี index
-- รองรับ) แทนที่จะดึงข้อความทุกแถวมา group เอง ส่วน chat_messages ยังคง insert ทีละแถวต่อ
-- ข้อความเหมือนเดิมทุกประการ ไม่มีอะไรเปลี่ยน
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

-- แชทมีแค่ระหว่าง "เจ้าของสินค้า (seller)" กับ "คนที่ทักมา (buyer)" เสมอ (ChatButton ขึ้นเฉพาะ
-- ในหน้าสินค้า ชี้ไปหาผู้ขายเท่านั้น) เลยระบุห้องแชทหนึ่งได้ไม่ซ้ำกันด้วย (product_id, buyer_id)
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  seller_id uuid not null references users(id) on delete cascade,
  buyer_id uuid not null references users(id) on delete cascade,
  last_message_text text not null,
  last_message_at timestamptz not null default now(),
  last_message_from_id uuid not null references users(id) on delete cascade,
  seller_unread_count int not null default 0 check (seller_unread_count >= 0),
  buyer_unread_count int not null default 0 check (buyer_unread_count >= 0),
  created_at timestamptz not null default now(),
  unique (product_id, buyer_id)
);

create index idx_chat_threads_seller on chat_threads(seller_id, last_message_at desc);
create index idx_chat_threads_buyer on chat_threads(buyer_id, last_message_at desc);

alter table chat_threads enable row level security;

-- ผูกแต่ละข้อความเข้ากับห้องแชทของมัน ให้ query ประวัติข้อความ/mark-as-read เจาะจงทีละห้องได้เร็วขึ้น
alter table chat_messages add column thread_id uuid references chat_threads(id) on delete cascade;

-- backfill: สร้างห้องแชทจากข้อความเก่าที่มีอยู่แล้วในระบบ จัดกลุ่มตาม (product_id, buyer_id)
insert into chat_threads (
  product_id, seller_id, buyer_id, last_message_text, last_message_at, last_message_from_id,
  seller_unread_count, buyer_unread_count, created_at
)
select
  m.product_id,
  p.seller_id,
  (case when m.from_user_id = p.seller_id then m.to_user_id else m.from_user_id end) as buyer_id,
  (array_agg(m.text order by m.created_at desc))[1] as last_message_text,
  max(m.created_at) as last_message_at,
  (array_agg(m.from_user_id order by m.created_at desc))[1] as last_message_from_id,
  count(*) filter (where m.to_user_id = p.seller_id and m.read = false) as seller_unread_count,
  count(*) filter (where m.to_user_id <> p.seller_id and m.read = false) as buyer_unread_count,
  min(m.created_at) as created_at
from chat_messages m
join products p on p.id = m.product_id
group by m.product_id, p.seller_id,
  (case when m.from_user_id = p.seller_id then m.to_user_id else m.from_user_id end)
on conflict (product_id, buyer_id) do nothing;

-- ผูก thread_id กลับเข้าไปในข้อความเก่าทุกแถวให้ตรงกับห้องที่เพิ่ง backfill ไป
update chat_messages m
set thread_id = t.id
from chat_threads t, products p
where p.id = m.product_id
  and t.product_id = m.product_id
  and t.buyer_id = (case when m.from_user_id = p.seller_id then m.to_user_id else m.from_user_id end)
  and m.thread_id is null;

-- ถึงจุดนี้ backfill ครอบคลุมข้อความเก่าครบทุกแถวแล้ว บังคับว่าข้อความใหม่ต่อจากนี้ต้องมี
-- thread_id เสมอ (เขียนผ่านฟังก์ชัน send_chat_message() ด้านล่างเท่านั้น)
alter table chat_messages alter column thread_id set not null;

create index idx_chat_messages_thread on chat_messages(thread_id, created_at);

-- ส่งข้อความ: หา/สร้างห้องแชทและอัปเดตสรุป (ข้อความล่าสุด + ตัวนับยังไม่อ่านของผู้รับ) พร้อมกับ
-- insert ข้อความจริงในธุรกรรมเดียวกันแบบ atomic — กันสองข้อความที่ส่งไล่เลี่ยกันมาก (หรือสวนทาง
-- กันพอดี) แข่งกันอัปเดตตัวนับ unread จนนับพลาดได้ (คล้ายปัญหา race condition ของสถานะออเดอร์
-- ที่เจอมาก่อนหน้านี้ — ใช้ SQL function แทนการยิงหลาย query จาก JS client ด้วยเหตุผลเดียวกัน)
create or replace function send_chat_message(
  p_product_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_text text
) returns setof chat_messages
language plpgsql
as $$
declare
  v_thread_id uuid;
  v_seller_id uuid;
  v_buyer_id uuid;
begin
  select seller_id into v_seller_id from products where id = p_product_id;
  if v_seller_id is null then
    raise exception 'product not found';
  end if;
  v_buyer_id := case when p_from_user_id = v_seller_id then p_to_user_id else p_from_user_id end;

  insert into chat_threads (
    product_id, seller_id, buyer_id, last_message_text, last_message_at, last_message_from_id,
    seller_unread_count, buyer_unread_count
  )
  values (
    p_product_id, v_seller_id, v_buyer_id, p_text, now(), p_from_user_id,
    case when v_seller_id = p_to_user_id then 1 else 0 end,
    case when v_buyer_id = p_to_user_id then 1 else 0 end
  )
  on conflict (product_id, buyer_id) do update set
    last_message_text = excluded.last_message_text,
    last_message_at = excluded.last_message_at,
    last_message_from_id = excluded.last_message_from_id,
    seller_unread_count = chat_threads.seller_unread_count
      + (case when v_seller_id = p_to_user_id then 1 else 0 end),
    buyer_unread_count = chat_threads.buyer_unread_count
      + (case when v_buyer_id = p_to_user_id then 1 else 0 end)
  returning id into v_thread_id;

  return query
    insert into chat_messages (product_id, from_user_id, to_user_id, text, thread_id)
    values (p_product_id, p_from_user_id, p_to_user_id, p_text, v_thread_id)
    returning *;
end;
$$;

-- เปิดอ่านห้องแชท: mark ข้อความที่ยังไม่อ่านของฝั่งเราเป็นอ่านแล้ว แล้วคำนวณตัวนับ unread ใหม่
-- จาก count(*) จริงในธุรกรรมเดียวกัน (ไม่ใช่ set เป็น 0 ตรงๆ) กันเคสข้อความใหม่โผล่มาพอดีตอน
-- กำลังเปิดอ่านแล้วโดนนับหายไปเงียบๆ
create or replace function mark_thread_read(p_thread_id uuid, p_reader_id uuid)
returns void
language plpgsql
as $$
begin
  update chat_messages set read = true
  where thread_id = p_thread_id and to_user_id = p_reader_id and read = false;

  update chat_threads set
    seller_unread_count = case when seller_id = p_reader_id then
      (select count(*) from chat_messages where thread_id = p_thread_id and to_user_id = p_reader_id and read = false)
      else seller_unread_count end,
    buyer_unread_count = case when buyer_id = p_reader_id then
      (select count(*) from chat_messages where thread_id = p_thread_id and to_user_id = p_reader_id and read = false)
      else buyer_unread_count end
  where id = p_thread_id;
end;
$$;
