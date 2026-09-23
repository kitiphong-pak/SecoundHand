-- Migration 024: นัดที่ยังไม่ระบุเวลา + อ่านเวลาจากแชท
--
-- เดิมข้อเสนอนัดต้องมีเวลาเสมอ แต่ในชีวิตจริงคนมักตกลง "สถานที่" ได้ก่อน แล้วค่อยเคาะเวลากันทีหลัง
-- ("เอาหน้าห้างนะ เดี๋ยวนัดเวลาอีกที") พอบังคับให้กรอกเวลาก่อน คนจะกรอกมั่วๆ ไปก่อน ซึ่งแย่กว่า
-- ปล่อยว่างไว้ เพราะเวลามั่วจะกลายเป็นนัดจริงที่อีกฝ่ายเชื่อ
--
-- กติกาใหม่: ข้อเสนอนัดมีสถานที่เสมอ ส่วนเวลามีหรือไม่มีก็ได้ แต่ออเดอร์จะนับว่า "นัดเจอแล้ว"
-- (meetup_scheduled) ก็ต่อเมื่อมีเวลาแล้วเท่านั้น — นัดที่ไม่มีเวลายังไม่ใช่นัด เพราะไม่มีใครรู้ว่า
-- จะไปเจอกันกี่โมง และ Phase 2 (คะแนนมาตามนัด) ก็ไม่มีเวลาให้เทียบว่าใครมาสายหรือไม่มา
--
-- ฝั่งหน้าจอจะอ่านเวลาจากข้อความแชทให้เอง (ดู src/lib/thaiTime.ts) แล้วขึ้นชิปให้กดยืนยันก่อน
-- ไม่ได้บันทึกเงียบๆ — ภาษาไทยบอกเวลาหลายระบบปนกัน ("ห้าโมง" = 17:00 แต่ "ห้าโมงเช้า" = 11:00)
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

alter table meetup_proposals alter column meetup_at drop not null;

-- เสนอนัด: เหมือน 023 ทุกอย่าง ต่างแค่ยอมให้ไม่มีเวลาได้ และข้อความในแชทเปลี่ยนตามนั้น
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
  -- เวลาไม่ใส่ก็ได้ แต่ถ้าใส่มาต้องเป็นอนาคตเสมอ
  if p_meetup_at is not null and p_meetup_at <= now() then
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
  v_text := case
    when p_meetup_at is null then 'ขอนัดเจอที่ ' || trim(p_place) || ' (ยังไม่ได้ระบุเวลา)'
    else 'ขอนัดเจอ ' || to_char(p_meetup_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI')
      || ' น. ที่ ' || trim(p_place)
  end;

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

-- ตอบรับ/ปฏิเสธข้อเสนอนัด — ด่านกันคนเสนอกดยืนยันเองและกันตอบซ้ำ เหมือน 023 ทุกอย่าง
-- ที่เพิ่มมาคือการตัดสินว่าออเดอร์จะได้สถานะ "นัดเจอแล้ว" หรือยัง ซึ่งขึ้นกับว่ามีเวลาแล้วหรือเปล่า
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
  --
  -- ข้อเสนอที่ไม่มีเวลาจะเปลี่ยนแค่สถานที่ ไม่ล้างเวลาที่เคยตกลงกันไว้แล้วทิ้ง (coalesce) และไม่
  -- เลื่อนสถานะเป็น "นัดเจอแล้ว" ถ้ายังไม่เคยมีเวลาเลย
  if p_accept then
    update orders
    set meetup_at = coalesce(v_proposal.meetup_at, meetup_at),
        meetup_place = v_proposal.place,
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
