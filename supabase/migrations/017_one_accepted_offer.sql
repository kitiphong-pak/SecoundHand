-- Migration 017: ตกลงราคากันได้ครั้งละข้อเสนอเดียว และยกเลิกข้อตกลงได้
--
-- บั๊กที่แก้: create_offer ใน 016 ล้างเฉพาะข้อเสนอที่ยัง pending ก่อนสร้างอันใหม่ ส่วนข้อเสนอที่
-- accepted ไปแล้วไม่ถูกแตะเลย ผลคือคู่สนทนาเดียวกันมีข้อเสนอที่ "ตกลงราคานี้แล้ว" ค้างพร้อมกัน
-- ได้หลายอัน และ POST /api/orders ก็เช็คแค่ว่า offerId นั้น accepted อยู่ — ไม่ได้เช็คว่าเป็น
-- อันล่าสุด เลื่อนแชทขึ้นไปกดปุ่มซื้อของข้อเสนอเก่าก็ซื้อในราคานั้นได้ ทั้งที่ต่อรองกันใหม่ไปแล้ว
--
-- กติกาใหม่: ข้อตกลงที่ยังมีผลมีได้ครั้งละหนึ่งเดียวต่อ (สินค้า, คู่สนทนา) ถ้าอยากต่อรองใหม่
-- ต้องยกเลิกข้อตกลงเดิมก่อน — บังคับให้การเปลี่ยนใจเป็นการกระทำที่ตั้งใจและอีกฝ่ายเห็นในแชท
-- ไม่ใช่ผลข้างเคียงเงียบๆ ของการกดเสนอราคาอีกรอบ

-- 1) ล้างข้อมูลเดิมที่หลุดมาก่อนหน้านี้ — เก็บข้อตกลงล่าสุดของแต่ละคู่ไว้ ที่เหลือถือว่าถูกแทนที่
--    "คู่สนทนา" คิดจากฝั่งผู้ซื้อ (คนที่ไม่ใช่ seller ของสินค้า) เพราะข้อเสนอวิ่งได้สองทาง
--    ทำก่อนสร้าง unique index ไม่งั้น index สร้างไม่ผ่านเพราะข้อมูลเดิมชนกันเอง
with ranked as (
  select o.id,
         row_number() over (
           partition by o.product_id,
             case when o.from_user_id = p.seller_id then o.to_user_id else o.from_user_id end
           order by o.created_at desc
         ) as rn
  from offers o
  join products p on p.id = o.product_id
  where o.status = 'accepted'
)
update offers set status = 'cancelled', responded_at = now()
where id in (select id from ranked where rn > 1);

-- 2) ทำให้กติกาเป็นโครงสร้าง ไม่ใช่แค่เงื่อนไขในโค้ด — ต่อให้ในอนาคตมีทางเข้าใหม่ที่ลืมเช็ค
--    ฐานข้อมูลก็ยังปฏิเสธข้อตกลงที่สองอยู่ดี (หลักการเดียวกับ index กันขายซ้ำใน 008)
--
--    least/greatest ทำให้คู่ (A,B) กับ (B,A) กลายเป็นคีย์เดียวกัน จำเป็นเพราะข้อเสนอต่อรอง
--    กลับไปกลับมาได้ ถ้า index ตรงบน (from_user_id, to_user_id) เฉยๆ ผู้ซื้อเสนอไปหาผู้ขาย
--    กับผู้ขายเสนอกลับมาหาผู้ซื้อจะนับเป็นคนละคู่ แล้วมีข้อตกลงค้างพร้อมกันได้สองอันเหมือนเดิม
create unique index idx_offers_one_accepted_per_pair
  on offers (
    product_id,
    least(from_user_id, to_user_id),
    greatest(from_user_id, to_user_id)
  )
  where status = 'accepted';

-- 3) เสนอราคาใหม่ไม่ได้ถ้ายังมีข้อตกลงค้างอยู่ — ดักตั้งแต่ในฟังก์ชันเพื่อให้ได้ข้อความบอกผู้ใช้
--    ที่อ่านรู้เรื่อง แทนที่จะปล่อยไปชนกับ unique index แล้วได้ error ดิบๆ จากฐานข้อมูล
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

  -- ใช้ errcode เฉพาะเพื่อให้ฝั่ง API แยกออกว่านี่คือ "ตกลงกันไปแล้ว" (ตอบ 409 ได้) ไม่ใช่
  -- ความผิดพลาดของระบบ — เช็คจาก error.code แทนการเทียบข้อความ ข้อความแก้เมื่อไหร่ก็ไม่พัง
  if exists (
    select 1 from offers
    where product_id = p_product_id
      and status = 'accepted'
      and from_user_id in (p_from_user_id, p_to_user_id)
      and to_user_id in (p_from_user_id, p_to_user_id)
  ) then
    raise exception 'offer_already_accepted' using errcode = 'restrict_violation';
  end if;

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

-- 4) ยกเลิกข้อตกลง — ฝั่งไหนก็กดได้ เพราะทั้งคู่มีสิทธิ์เปลี่ยนใจก่อนจะมีออเดอร์จริง
--    compare-and-swap บน status='accepted' เหมือน respond_offer กันสองคนกดพร้อมกัน และกัน
--    คนนอกวงสนทนากดยกเลิกข้อตกลงของคนอื่น ถ้าไม่โดนแถวไหนจะคืนแถวว่าง ไม่ใช่ error
--
--    ส่งข้อความแจ้งในแชทด้วย ไม่งั้นอีกฝ่ายที่กำลังรอผู้ซื้อกดซื้อจะไม่รู้เลยว่าดีลล่มไปแล้ว
create or replace function cancel_offer_agreement(
  p_offer_id uuid,
  p_user_id uuid
) returns setof offers
language plpgsql
as $$
declare
  v_offer offers;
  v_seller_id uuid;
  v_buyer_id uuid;
  v_other_id uuid;
  v_thread_id uuid;
  v_text text;
begin
  update offers
  set status = 'cancelled', responded_at = now()
  where id = p_offer_id
    and status = 'accepted'
    and p_user_id in (from_user_id, to_user_id)
  returning * into v_offer;

  if v_offer.id is null then
    return;
  end if;

  select seller_id into v_seller_id from products where id = v_offer.product_id;
  v_buyer_id := case when v_offer.from_user_id = v_seller_id
                     then v_offer.to_user_id else v_offer.from_user_id end;
  v_other_id := case when p_user_id = v_offer.from_user_id
                     then v_offer.to_user_id else v_offer.from_user_id end;

  v_text := 'ยกเลิกข้อตกลงราคา ฿' || trim(to_char(v_offer.amount, 'FM999,999,999'));

  insert into chat_threads (
    product_id, seller_id, buyer_id, last_message_text, last_message_at, last_message_from_id,
    seller_unread_count, buyer_unread_count
  )
  values (
    v_offer.product_id, v_seller_id, v_buyer_id, v_text, now(), p_user_id,
    case when v_seller_id = v_other_id then 1 else 0 end,
    case when v_buyer_id = v_other_id then 1 else 0 end
  )
  on conflict (product_id, buyer_id) do update set
    last_message_text = excluded.last_message_text,
    last_message_at = excluded.last_message_at,
    last_message_from_id = excluded.last_message_from_id,
    seller_unread_count = chat_threads.seller_unread_count
      + (case when v_seller_id = v_other_id then 1 else 0 end),
    buyer_unread_count = chat_threads.buyer_unread_count
      + (case when v_buyer_id = v_other_id then 1 else 0 end)
  returning id into v_thread_id;

  insert into chat_messages (product_id, from_user_id, to_user_id, text, thread_id)
  values (v_offer.product_id, p_user_id, v_other_id, v_text, v_thread_id);

  return query select * from offers where id = v_offer.id;
end;
$$;
