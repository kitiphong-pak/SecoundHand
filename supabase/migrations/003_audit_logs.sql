-- Migration 003: audit log สำหรับหน้า "กิจกรรมระบบ" ของแอดมิน
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references users(id) on delete cascade,
  actor_role text not null, -- เก็บ snapshot ตอนเกิดเหตุการณ์ เผื่ออนาคต role ของ user เปลี่ยนได้
  action text not null, -- เช่น 'order.paid', 'order.disputed' ดู AuditAction ใน src/lib/auditLog.ts
  target_type text not null check (target_type in ('order', 'product', 'user')),
  target_id uuid not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_audit_logs_created_at on audit_logs(created_at desc);
create index idx_audit_logs_target on audit_logs(target_type, target_id);
create index idx_audit_logs_actor on audit_logs(actor_id);
