-- Migration 016: เพิ่มการเสนอราคาต่อรอง (offers) ผูกกับแชทซื้อขาย
-- เหตุผล: ตอนนี้แชทเป็นข้อความอิสระล้วนๆ ต่อรองราคากันได้แค่ในเนื้อข้อความ แต่พอตกลงราคากันได้
-- แล้วก็ยังต้องกลับไปกด "ซื้อ" ที่หน้าสินค้าซึ่งใช้ราคาที่ตั้งไว้ตอนลงขายเสมอ (ดู
-- POST /api/orders — amount: product.price ตรงๆ) ไม่มีทางส่งราคาที่ต่อรองกันได้เข้าไปในออเดอร์เลย
-- ตารางนี้เก็บ "ข้อเสนอ" แต่ละครั้งแยกจากเนื้อข้อความแชท เพื่อให้มีสถานะ (pending/accepted/...)
-- ที่ผูกกับปุ่มกดยอมรับ/ปฏิเสธได้ และให้ POST /api/orders รับ offerId แล้วใช้ราคานั้นแทนได้
--
-- ออกแบบให้ต่อรองได้ทั้งสองทาง (ผู้ซื้อเสนอราคาไปหาผู้ขาย หรือผู้ขายต่อราคากลับไปหาผู้ซื้อ) —
-- ไม่ผูกว่า "ผู้เสนอ" ต้องเป็นฝั่งไหนเสมอ ระบุแค่ from/to แต่ "ใครเป็นผู้ซื้อจริง" ยังคงตัดสินจาก
-- products.seller_id เท่านั้น (คนที่ไม่ใช่ seller ของสินค้าเสมอ) เหมือนเดิมทุกที่ในระบบ
--
-- การ "ยอมรับ" ข้อเสนอไม่ได้สร้างออเดอร์ทันที แค่เปลี่ยนสถานะเป็น accepted — ฝั่งผู้ซื้อต้องกด
-- ซื้อเองอีกทีถึงจะสร้างออเดอร์จริง เหตุผล: ผู้ขายไม่ควรเป็นคนกดสร้างออเดอร์ซื้อของตัวเอง (ผิดกฎ
-- เดิมที่ POST /api/orders บังคับไว้อยู่แล้ว) และการกดซื้อควรเป็นการกระทำที่ตั้งใจแยกจากการ
-- ต่อรองราคาเสมอ ไม่ใช่ผลข้างเคียงของการกดปุ่มตอบรับ
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

create table offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  from_user_id uuid not null references users(id) on delete cascade,
  to_user_id uuid not null references users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index idx_offers_product on offers(product_id, created_at desc);

alter table offers enable row level security;

-- ผูกข้อความแชทเข้ากับข้อเสนอที่มันแสดง (ถ้ามี) — ข้อความทั่วไปยังเป็น null เหมือนเดิม
alter table chat_messages add column offer_id uuid references offers(id) on delete set null;

-- เสนอราคา: ยกเลิกข้อเสนอ pending เก่าของคู่สนทนานี้ในสินค้านี้ก่อน (ข้อเสนอล่าสุดคือสิ่งที่
-- "อยู่บนโต๊ะ" เสมอ ไม่ปล่อยให้มีหลายข้อเสนอค้างพร้อมกันจนงงว่าฝั่งไหนต้องตอบอันไหน) แล้วสร้าง
-- ข้อเสนอใหม่พร้อมส่งข้อความแจ้งในห้องแชทแบบ atomic เดียวกับ send_chat_message เดิม
create or replace function create_offer(
  p_product_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_amount numeric
) returns setof offers
language plpgsql
as $$
declare
  v_offer_id uuid;
  v_seller_id uuid;
  v_buyer_id uuid;
  v_thread_id uuid;
  v_text text;
begin
  select seller_id into v_seller_id from products where id = p_product_id;
  if v_seller_id is null then
    raise exception 'product not found';
  end if;
  v_buyer_id := case when p_from_user_id = v_seller_id then p_to_user_id else p_from_user_id end;

  update offers set status = 'cancelled', responded_at = now()
  where product_id = p_product_id and status = 'pending'
    and from_user_id in (p_from_user_id, p_to_user_id);

  insert into offers (product_id, from_user_id, to_user_id, amount)
  values (p_product_id, p_from_user_id, p_to_user_id, p_amount)
  returning id into v_offer_id;

  v_text := 'เสนอราคา ฿' || trim(to_char(p_amount, 'FM999,999,999'));

  insert into chat_threads (
    product_id, seller_id, buyer_id, last_message_text, last_message_at, last_message_from_id,
    seller_unread_count, buyer_unread_count
  )
  values (
    p_product_id, v_seller_id, v_buyer_id, v_text, now(), p_from_user_id,
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

  insert into chat_messages (product_id, from_user_id, to_user_id, text, thread_id, offer_id)
  values (p_product_id, p_from_user_id, p_to_user_id, v_text, v_thread_id, v_offer_id);

  return query select * from offers where id = v_offer_id;
end;
$$;

-- ตอบรับ/ปฏิเสธข้อเสนอ — compare-and-swap บน status='pending' กันกดซ้ำสองครั้งพร้อมกัน (เหมือน
-- pattern กันขายซ้ำใน POST /api/orders) และเงื่อนไข to_user_id = p_responder_id กันคนอื่นนอกวง
-- สนทนากดตอบแทน ถ้าไม่โดนแถวไหนเลย (ตอบไปแล้ว/หมดอายุ/ไม่มีสิทธิ์) จะคืนแถวว่างเปล่า ไม่ error
create or replace function respond_offer(
  p_offer_id uuid,
  p_responder_id uuid,
  p_accept boolean
) returns setof offers
language plpgsql
as $$
begin
  return query
    update offers
    set status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now()
    where id = p_offer_id and to_user_id = p_responder_id and status = 'pending'
    returning *;
end;
$$;
