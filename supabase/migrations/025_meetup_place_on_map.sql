-- Migration 025: จุดนัดเป็นหมุดบนแผนที่ และแยกการนัด "เวลา" กับ "สถานที่" ออกจากกัน
--
-- เดิมสถานที่นัดเป็นข้อความล้วนที่พิมพ์เอง ซึ่งอ่านแล้วตีความได้หลายแบบ ("หน้าห้าง" หน้าไหน) และ
-- ระบบเอาไปทำอะไรต่อไม่ได้เลย — เปิดแผนที่นำทางก็ไม่ได้ เทียบระยะทางก็ไม่ได้ ตอนนี้จุดนัดมาจาก
-- การปักหมุดบนแผนที่เสมอ จึงเก็บพิกัดไว้ด้วย ส่วน place ยังเก็บไว้เป็น "ชื่อที่คนอ่านรู้เรื่อง"
-- (ได้จากการค้นหา/อ่านย้อนจากพิกัด) เพราะพิกัดเปล่าๆ ไม่มีใครอ่านออก
--
-- อีกเรื่องที่เปลี่ยนพร้อมกัน: ข้อเสนอนัดไม่จำเป็นต้องมีครบทั้งเวลาและสถานที่อีกต่อไป จะมีแค่
-- อย่างใดอย่างหนึ่งก็ได้ (มีอย่างน้อยหนึ่งอย่าง) เพราะหน้าจอแยกเป็นสองปุ่มแล้ว — กดปักหมุดอย่างเดียว
-- หรือกดเลือกเวลาอย่างเดียวก็เสนอได้ อีกฝ่ายตอบรับแล้วค่าที่ไม่ได้ส่งมาจะคงของเดิมไว้ (coalesce)
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

alter table meetup_proposals alter column place drop not null;
alter table meetup_proposals add column if not exists lat double precision;
alter table meetup_proposals add column if not exists lng double precision;
alter table meetup_proposals add column if not exists place_note text;

-- ข้อเสนอที่ว่างทั้งเวลาและสถานที่ไม่มีความหมายอะไรเลย ฐานข้อมูลกันไว้ไม่ให้เกิดขึ้นได้
alter table meetup_proposals drop constraint if exists meetup_proposals_has_something_check;
alter table meetup_proposals add constraint meetup_proposals_has_something_check
  check (meetup_at is not null or place is not null);

-- พิกัดต้องอยู่ในช่วงที่เป็นไปได้จริง (กันค่าเพี้ยนจากการคำนวณฝั่งหน้าจอ)
alter table meetup_proposals drop constraint if exists meetup_proposals_latlng_check;
alter table meetup_proposals add constraint meetup_proposals_latlng_check check (
  (lat is null and lng is null)
  or (lat between -90 and 90 and lng between -180 and 180)
);

alter table orders add column if not exists meetup_lat double precision;
alter table orders add column if not exists meetup_lng double precision;
alter table orders add column if not exists meetup_place_note text;

-- ต้องลบตัวเดิมทิ้งก่อน ไม่ใช่ create or replace เฉยๆ — พารามิเตอร์ใหม่มี default ทำให้เรียกด้วย
-- 4 อาร์กิวเมนต์แล้วเข้าได้ทั้งสองตัว Postgres จะฟ้องว่าเรียกฟังก์ชันกำกวม (ambiguous)
drop function if exists propose_meetup(uuid, uuid, timestamptz, text);

-- เสนอนัด: เพิ่มพิกัดกับหมายเหตุจุดนัด และยอมให้ส่งมาเฉพาะเวลาหรือเฉพาะสถานที่ก็ได้
create or replace function propose_meetup(
  p_order_id uuid,
  p_from_user_id uuid,
  p_meetup_at timestamptz,
  p_place text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_place_note text default null
) returns setof meetup_proposals
language plpgsql
as $$
declare
  v_order orders;
  v_to_user_id uuid;
  v_thread_id uuid;
  v_proposal_id uuid;
  v_place text;
  v_text text;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.status not in ('reserved', 'meetup_scheduled') then
    raise exception 'order not open' using errcode = 'restrict_violation';
  end if;
  if p_from_user_id not in (v_order.buyer_id, v_order.seller_id) then
    raise exception 'not a party of this order' using errcode = 'insufficient_privilege';
  end if;
  if p_meetup_at is not null and p_meetup_at <= now() then
    raise exception 'meetup must be in the future' using errcode = 'check_violation';
  end if;

  v_place := nullif(trim(coalesce(p_place, '')), '');
  if p_meetup_at is null and v_place is null then
    raise exception 'meetup needs a time or a place' using errcode = 'check_violation';
  end if;

  v_to_user_id := case when p_from_user_id = v_order.seller_id then v_order.buyer_id else v_order.seller_id end;

  update meetup_proposals set status = 'superseded', responded_at = now()
  where order_id = p_order_id and status = 'pending';

  insert into meetup_proposals (order_id, proposed_by, meetup_at, place, lat, lng, place_note)
  values (
    p_order_id, p_from_user_id, p_meetup_at, v_place, p_lat, p_lng,
    nullif(trim(coalesce(p_place_note, '')), '')
  )
  returning id into v_proposal_id;

  -- ข้อความในแชทบอกเฉพาะสิ่งที่เสนอมาจริงๆ ไม่ต้องเติมคำว่า "ยังไม่ได้ระบุ" ให้รก การ์ดในแชท
  -- แสดงรายละเอียดครบอยู่แล้ว
  v_text := 'ขอนัดเจอ'
    || coalesce(' ' || to_char(p_meetup_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI') || ' น.', '')
    || coalesce(' ที่ ' || v_place, '');

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

-- ตอบรับ/ปฏิเสธ: ค่าที่ข้อเสนอนั้นไม่ได้ระบุมา ให้คงของเดิมในออเดอร์ไว้ (เสนอเฉพาะเวลา = ย้ายเวลา
-- อย่างเดียว ที่นัดเดิมยังอยู่ และกลับกัน) สถานะเป็น "นัดเจอแล้ว" เมื่อมีเวลาแล้วเท่านั้นเหมือนเดิม
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

  if p_accept then
    update orders
    set meetup_at = coalesce(v_proposal.meetup_at, meetup_at),
        meetup_place = coalesce(v_proposal.place, meetup_place),
        meetup_lat = case when v_proposal.place is not null then v_proposal.lat else meetup_lat end,
        meetup_lng = case when v_proposal.place is not null then v_proposal.lng else meetup_lng end,
        meetup_place_note = case
          when v_proposal.place is not null then v_proposal.place_note
          else meetup_place_note
        end,
        meetup_proposed_by = v_proposal.proposed_by,
        meetup_confirmed_at = now(),
        status = case
          when coalesce(v_proposal.meetup_at, meetup_at) is not null then 'meetup_scheduled'
          else status
        end
    where id = v_proposal.order_id
      and status in ('reserved', 'meetup_scheduled');
  end if;

  return next v_proposal;
end;
$$;
