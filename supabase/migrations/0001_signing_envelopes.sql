-- DocuSign signing: tracks one envelope per estimate so the Connect webhook can
-- map a completed signature back to the originating estimate. The app data lives
-- in the browser (localStorage); this table is the minimal server-side record
-- needed for cross-device status + webhook reconciliation.

create table if not exists public.signing_envelopes (
  id            uuid primary key default gen_random_uuid(),
  envelope_id   text unique not null,
  estimate_id   text not null,
  estimate_name text,
  client_email  text,
  client_name   text,
  -- email | embedded
  mode          text not null default 'email',
  -- sent | delivered | completed | declined | voided
  status        text not null default 'sent',
  signer_name   text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists signing_envelopes_estimate_idx
  on public.signing_envelopes (estimate_id, created_at desc);

-- The Edge Function uses the service-role key, which bypasses RLS. Enable RLS
-- with no public policies so the table is not readable via the anon/public API.
alter table public.signing_envelopes enable row level security;
