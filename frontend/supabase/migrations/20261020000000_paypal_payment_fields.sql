-- Migration: 20261020000000_paypal_payment_fields.sql
-- Purpose: Durable payment transaction tracking and PayPal webhook deduplication

create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null default 'paypal_sandbox',
  paypal_order_id text unique,
  authorization_id text unique,
  capture_id text unique,
  last_refund_id text,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'USD',
  state text not null,
  provider_order_status text,
  authorization_expires_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists payment_transactions_order_id_idx
  on payment_transactions(order_id, created_at desc);

create table if not exists paypal_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  transmission_id text not null,
  event_type text not null,
  resource_type text,
  summary text,
  order_id uuid references orders(id) on delete set null,
  status text not null default 'processed',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_paypal_webhook_event_id on paypal_webhook_events(event_id);

-- RLS policies
alter table payment_transactions enable row level security;
grant select, insert, update on payment_transactions to authenticated;
grant all on payment_transactions to service_role;

alter table paypal_webhook_events enable row level security;
grant select on paypal_webhook_events to authenticated;
grant all on paypal_webhook_events to service_role;
