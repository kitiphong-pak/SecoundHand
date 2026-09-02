-- Migration 001: ตารางตั้งต้นทั้งหมดของระบบ
-- เดิมไฟล์นี้ชื่อ supabase/schema.sql และต้อง paste เข้า SQL Editor เอง ย้ายมาเป็น migration
-- ตัวแรกเพื่อให้ฐานข้อมูลใหม่สร้างเสร็จด้วย npm run migrate คำสั่งเดียว ไม่มีขั้นตอนที่ต้องทำมือ
-- (ตัวรัน migration จดไว้ว่ารันไฟล์ไหนแล้ว จึงไม่มีทางรันซ้ำโดยไม่ตั้งใจ)

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  province text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  avatar_url text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- โทเค่นเซสชันจาก cookie ล็อกอิน — เดิมเก็บใน Map ในหน่วยความจำ ย้ายมาไว้ที่นี่ด้วย
-- เพื่อให้ล็อกอินค้างอยู่ได้จริงข้าม server restart เหมือนข้อมูลอื่น ๆ
create table sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text not null,
  price numeric not null,
  category text not null,
  condition text not null check (condition in ('new', 'like_new', 'good', 'fair')),
  province text not null,
  images text[] not null default '{}',
  status text not null default 'listed' check (status in ('listed', 'reserved', 'sold', 'removed')),
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  buyer_id uuid not null references users(id) on delete cascade,
  seller_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending_payment' check (
    status in (
      'pending_payment', 'paid', 'awaiting_buyer_confirmation',
      'awaiting_otp_entry', 'completed', 'disputed'
    )
  ),
  amount numeric not null,
  otp_code text,
  otp_expires_at timestamptz,
  seller_marked_delivered_at timestamptz,
  buyer_confirmed_at timestamptz,
  completed_at timestamptz,
  dispute_reason text,
  dispute_opened_at timestamptz,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  from_user_id uuid not null references users(id) on delete cascade,
  to_user_id uuid not null references users(id) on delete cascade,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_user_id uuid not null references users(id) on delete cascade,
  to_user_id uuid not null references users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null,
  created_at timestamptz not null default now()
);

-- อินเด็กซ์ตาม pattern การคิวรีที่ใช้จริงในแอป
create index idx_products_seller on products(seller_id);
create index idx_products_province_status on products(province, status);
create index idx_orders_buyer on orders(buyer_id);
create index idx_orders_seller on orders(seller_id);
create index idx_orders_product on orders(product_id);
create index idx_messages_product on chat_messages(product_id);
create index idx_messages_to_user_read on chat_messages(to_user_id, read);
create index idx_sessions_user on sessions(user_id);

-- หมายเหตุ: แอปเข้าถึงตารางเหล่านี้ผ่าน secret key (service_role, สิทธิ์แอดมิน ข้าม RLS
-- โดยอัตโนมัติ) จาก server เท่านั้น ไม่มีโค้ดฝั่ง browser คิวรีตรงเข้ามาเลย แต่ก็ยังเปิด Row
-- Level Security ไว้เป็น default-deny สำหรับ anon/publishable key ด้วย (ดู
-- supabase/migrations/005_enable_rls.sql) เผื่อ key รั่วหรือมีโค้ดฝั่ง client เผลอหลุดไปคิวรีตรง
-- จะได้ไม่เห็นข้อมูลของคนอื่นทั้งระบบทันที ถ้าในอนาคตอยากให้ browser คิวรีตรงด้วย publishable
-- key ต้องเขียน policy เฉพาะให้ตารางที่ต้องการเพิ่มเอง ไม่ใช่เปิด policy กว้างๆ แบบ "true"
