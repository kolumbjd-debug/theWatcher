-- Run this in the Supabase SQL editor to create the price_gaps table.

create table if not exists public.price_gaps (
  id uuid primary key default gen_random_uuid(),
  pair_name text not null,
  dex_a text not null,
  dex_b text not null,
  price_a numeric not null,
  price_b numeric not null,
  gap_percent numeric not null,
  pool_liquidity_a numeric,
  pool_liquidity_b numeric,
  detected_at timestamptz not null default now()
);

-- No secondary indexes on pair_name/detected_at: at this table's expected
-- size (a handful of pairs, rows periodically archived out), a full table
-- scan is cheap and the index storage overhead isn't worth it. Revisit if
-- the table is ever left to grow large and unarchived, or if analysis
-- queries against it get slow.

-- RLS is enabled with no policies: only the service_role key (used by the
-- backend scanner, never exposed to a client) can read/write this table.
-- The anon/public key has zero access by default.
alter table public.price_gaps enable row level security;
