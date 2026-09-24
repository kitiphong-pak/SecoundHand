-- Migration 023: การ์ดนัดเจอในแชท (Phase 1d)
--
-- flow ใหม่ไม่มีเงินผ่านระบบ "การนัดเจอ" จึงเป็นเหตุการณ์เดียวที่ระบบพอจะรู้จักได้ว่าดีลนี้เดินไปถึงไหน
-- ก่อนหน้านี้คู่ซื้อขายนัดกันในเนื้อข้อความล้วนๆ ซึ่งระบบอ่านไม่ออก — ไม่รู้ว่านัดกันหรือยัง นัดกี่โมง
-- ที่ไหน เตือนก่อนถึงเวลาก็ไม่ได้ และ Phase 2 (คะแนน "มาตามนัด") ก็ไม่มีวันนัดให้อ้างอิงเลย
--
-- ออกแบบตามตาราง offers (migration 016) ทุกประการ เพราะเป็นปัญหาเดียวกัน: ข้อเสนอที่ส่งไปแล้ว
-- ยังเปลี่ยนสถานะได้ทีหลัง (อีกฝ่ายกดตอบรับ/ปฏิเสธ) เลยเก็บเป็นแถวแยกต่อหนึ่งข้อเสนอ แล้วผูกกับ
-- ข้อความแชทที่แสดงมัน — ไม่ยัดสถานะลงในเนื้อข้อความซึ่งแก้ย้อนหลังไม่ได้
--
-- ต่างจาก offers ตรงที่ผูกกับ "ออเดอร์" ไม่ใช่สินค้า เพราะการนัดเจอเกิดหลังมีการจองแล้วเท่านั้น
-- ส่วนผลลัพธ์ที่ตกลงกันได้จะถูกเขียนลง orders.meetup_* (คอลัมน์จาก migration 020) ให้ที่เดียว
-- เป็นแหล่งความจริงว่า "ตกลงนัดกันเมื่อไหร่" โดยไม่ต้องไล่อ่านประวัติข้อเสนอทั้งหมด
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

create table meetup_proposals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  proposed_by uuid not null references users(id) on delete cascade,
  meetup_at timestamptz not null,
  place text not null check (length(trim(place)) > 0),
  -- superseded = มีคนเสนอเวลาใหม่ทับก่อนที่อันนี้จะถูกตอบ (ต่างจาก declined ที่อีกฝ่ายกดปฏิเสธจริงๆ)
  -- แยกสองอย่างนี้ออกจากกันเพราะ Phase 2 จะอ่านว่า "ใครปฏิเสธนัดบ่อย" ซึ่งต้องไม่นับอันที่ถูกทับ
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'superseded')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index idx_meetup_proposals_order on meetup_proposals(order_id, created_at desc);

alter table meetup_proposals enable row level security;

-- ผูกข้อความแชทเข้ากับข้อเสนอนัดที่มันแสดง (ถ้ามี) — เหมือน offer_id ของการเสนอราคา
alter table chat_messages add column meetup_proposal_id uuid references meetup_proposals(id) on delete set null;

-- เสนอนัด: ทับข้อเสนอที่ยังค้างอยู่ของออเดอร์นี้ แล้วสร้างอันใหม่พร้อมส่งข้อความเข้าห้องแชทใน
-- ธุรกรรมเดียวกัน (atomic) — เหมือน create_offer ทุกอย่าง เหตุผลเดียวกัน: ถ้าแยกเป็นสองคำสั่งจาก
-- ฝั่งแอป แล้วคำสั่งที่สองพลาด จะเหลือข้อเสนอที่ไม่มีใครเห็นในแชท หรือข้อความที่ชี้ไปหาของที่ไม่มีจริง
create or replace function propose_meetup(
  p_order_id uuid,
  p_from_user_id uuid,
  p_meetup_at timestamptz,
  p_place text
) returns setof meetup_proposals
language plpgsql
as $$
declare
  v_order orders;
  v_to_user_id uuid;
  v_thread_id uuid;
  v_proposal_id uuid;
  v_text text;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found';
  end if;
  -- นัดได้เฉพาะตอนออเดอร์ยังเดินอยู่ — ออเดอร์ที่ยกเลิก/ปิดไปแล้วต้องนัดใหม่ไม่ได้อีก
  if v_order.status not in ('reserved', 'meetup_scheduled') then
    raise exception 'order not open' using errcode = 'restrict_violation';
  end if;
  if p_from_user_id not in (v_order.buyer_id, v_order.seller_id) then
    raise exception 'not a party of this order' using errcode = 'insufficient_privilege';
  end if;
  if p_meetup_at <= now() then
    raise exception 'meetup must be in the future' using errcode = 'check_violation';
  end if;

  v_to_user_id := case when p_from_user_id = v_order.seller_id then v_order.buyer_id else v_order.seller_id end;

  -- ข้อเสนอล่าสุดคือสิ่งที่ "อยู่บนโต๊ะ" เสมอ ไม่ปล่อยให้มีหลายอันค้างพร้อมกันจนงงว่าต้องตอบอันไหน
  update meetup_proposals set status = 'superseded', responded_at = now()
  where order_id = p_order_id and status = 'pending';

  insert into meetup_proposals (order_id, proposed_by, meetup_at, place)
  values (p_order_id, p_from_user_id, p_meetup_at, trim(p_place))
  returning id into v_proposal_id;

  -- เวลาที่โชว์ในแชทต้องเป็นเวลาไทยเสมอ ไม่ใช่ UTC ตามที่เก็บ — ผู้ใช้ทั้งหมดอยู่ในไทย
  v_text := 'ขอนัดเจอ ' || to_char(p_meetup_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI')
    || ' น. ที่ ' || trim(p_place);

  insert into chat_threads (
    product_id, seller_id, buyer_id, last_message_text, last_message_at, last_message_from_id,
    seller_unread_count, buyer_unread_count
  )
  values (
    v_order.product_id, v_order.seller_id, v_order.buyer_id, v_text, now(), p_from_user_id,
    case when v_order.seller_id = v_to_user_id then 1 else 0 end,
    case when v_order.buyer_id = v_to_user_id then 1 else 0 end
  )
  on conflict (product_id, buyer_id) do update set
    last_message_text = excluded.last_message_text,
    last_message_at = excluded.last_message_at,
    last_message_from_id = excluded.last_message_from_id,
    seller_unread_count = chat_threads.seller_unread_count
      + (case when v_order.seller_id = v_to_user_id then 1 else 0 end),
    buyer_unread_count = chat_threads.buyer_unread_count
      + (case when v_order.buyer_id = v_to_user_id then 1 else 0 end)
  returning id into v_thread_id;

  insert into chat_messages (product_id, from_user_id, to_user_id, text, thread_id, meetup_proposal_id)
  values (v_order.product_id, p_from_user_id, v_to_user_id, v_text, v_thread_id, v_proposal_id);

  return query select * from meetup_proposals where id = v_proposal_id;
end;
$$;

-- ตอบรับ/ปฏิเสธข้อเสนอนัด — compare-and-swap บน status='pending' กันกดซ้ำพร้อมกันสองครั้ง และ
-- เงื่อนไข proposed_by <> ผู้ตอบ กันคนเสนอกดยืนยันนัดให้ตัวเอง (ซึ่งจะทำให้ "ตกลงนัดแล้ว" กลายเป็น
-- คำที่ไม่มีความหมาย และคะแนนมาตามนัดใน Phase 2 ปั่นได้ฟรีๆ) ถ้าไม่โดนแถวไหนเลยจะคืนแถวว่าง ไม่ error
create or replace function respond_meetup(
  p_proposal_id uuid,
  p_responder_id uuid,
  p_accept boolean
) returns setof meetup_proposals
language plpgsql
as $$
declare
  v_proposal meetup_proposals;
begin
  update meetup_proposals p
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  from orders o
  where p.id = p_proposal_id
    and o.id = p.order_id
    and p.status = 'pending'
    and p.proposed_by <> p_responder_id
    and p_responder_id in (o.buyer_id, o.seller_id)
    and o.status in ('reserved', 'meetup_scheduled')
  returning p.* into v_proposal;

  if not found then
    return;
  end if;

  -- เขียนนัดที่ตกลงกันแล้วลงออเดอร์ให้เป็นแหล่งความจริงที่เดียว พร้อมเงื่อนไขสถานะเดิมกำกับ
  -- (compare-and-swap) กันกรณีออเดอร์เพิ่งถูกยกเลิกไปพอดีระหว่างที่อีกฝ่ายกำลังกดยืนยันนัด
  if p_accept then
    update orders
    set meetup_at = v_proposal.meetup_at,
        meetup_place = v_proposal.place,
        meetup_proposed_by = v_proposal.proposed_by,
        meetup_confirmed_at = now(),
        status = 'meetup_scheduled'
    where id = v_proposal.order_id
      and status in ('reserved', 'meetup_scheduled');
  end if;

  return next v_proposal;
end;
$$;
