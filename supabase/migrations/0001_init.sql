-- QoE Lite — initial schema
-- Multi-tenant via orgs + org_members; every business table carries org_id and is
-- RLS-scoped through is_org_member(). Transactions are immutable (no UPDATE policy).

create extension if not exists pgcrypto;

-- ── Tenancy ────────────────────────────────────────────────────────────────

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','preparer','reviewer','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

-- First login: create an org and add the caller as owner (idempotent).
create or replace function public.bootstrap_org(p_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;
  if v_org is not null then
    return v_org;
  end if;
  insert into public.orgs (name) values (p_name) returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  return v_org;
end;
$$;
grant execute on function public.bootstrap_org(text) to authenticated;

-- ── Engagements & documents ────────────────────────────────────────────────

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  entity_name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'active' check (status in ('active','finalized','archived')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  doc_type text not null default 'unclassified' check (doc_type in
    ('bank_statement','pnl','balance_sheet','tax_return','ar_aging','ap_aging','payroll','other','unclassified')),
  period_start date,
  period_end date,
  account_hint text,
  classification_confidence numeric,
  classification_source text check (classification_source in ('rules','ai','user')),
  status text not null default 'uploaded' check (status in ('uploaded','needs_review','confirmed','parsed','failed')),
  parse_error text,
  created_at timestamptz not null default now()
);
create index on public.documents (engagement_id);

-- ── Ledger ─────────────────────────────────────────────────────────────────

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  name text not null,
  kind text not null default 'bank' check (kind in ('bank','credit_card')),
  created_at timestamptz not null default now(),
  unique (engagement_id, name)
);

-- Immutable: positive amount_cents = deposit/inflow, negative = disbursement.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  txn_date date not null,
  description text not null,
  amount_cents bigint not null,
  balance_cents bigint,
  source_line int,
  created_at timestamptz not null default now()
);
create index on public.transactions (engagement_id, txn_date);
create index on public.transactions (account_id, txn_date);

create table public.canonical_categories (
  key text primary key,
  label text not null,
  group_key text not null check (group_key in
    ('revenue','other_income','cogs','opex','owner_comp','depreciation_amortization','interest','taxes')),
  sort int not null default 0
);

insert into public.canonical_categories (key, label, group_key, sort) values
  ('revenue',            'Revenue',                        'revenue',                    10),
  ('other_income',       'Other income',                   'other_income',               20),
  ('cogs',               'Cost of goods sold',             'cogs',                       30),
  ('wages',              'Wages & payroll taxes',          'opex',                       40),
  ('owner_comp',         'Owner compensation',             'owner_comp',                 50),
  ('rent',               'Rent & occupancy',               'opex',                       60),
  ('insurance',          'Insurance',                      'opex',                       70),
  ('vehicle',            'Vehicle & fuel',                 'opex',                       80),
  ('professional_fees',  'Legal & professional fees',      'opex',                       90),
  ('marketing',          'Marketing & advertising',        'opex',                      100),
  ('office',             'Office & software',              'opex',                      110),
  ('other_opex',         'Other operating expenses',       'opex',                      120),
  ('depreciation',       'Depreciation & amortization',    'depreciation_amortization', 130),
  ('interest',           'Interest expense',               'interest',                  140),
  ('income_taxes',       'Income taxes',                   'taxes',                     150);

create table public.financial_facts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  month date not null,
  category_key text not null references public.canonical_categories(key),
  amount_cents bigint not null,
  source text not null default 'pnl_csv',
  document_id uuid references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (engagement_id, month, category_key, source)
);

-- ── Reconciliation & adjustments ───────────────────────────────────────────

create table public.txn_classifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  class text not null check (class in
    ('business_revenue','business_expense','owner_contribution','owner_draw',
     'loan_proceeds','loan_payment','transfer','personal_expense','refund','other')),
  note text,
  source text not null default 'user' check (source in ('auto','user','ai')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  name text not null,
  category text not null check (category in
    ('owner_comp','personal_expense','one_time','rent_normalization','pro_forma','accounting_correction','other')),
  rationale text not null,
  amount_cents bigint not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.adjustment_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  adjustment_id uuid not null references public.adjustments(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  check (document_id is not null or transaction_id is not null)
);

create table public.gate_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  gate_key text not null,
  note text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (engagement_id, gate_key)
);

-- Append-only.
create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  engagement_id uuid,
  user_id uuid,
  action text not null,
  entity_type text,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_events (org_id, created_at);

-- ── Row-level security ─────────────────────────────────────────────────────

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.engagements enable row level security;
alter table public.documents enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.canonical_categories enable row level security;
alter table public.financial_facts enable row level security;
alter table public.txn_classifications enable row level security;
alter table public.adjustments enable row level security;
alter table public.adjustment_evidence enable row level security;
alter table public.gate_acknowledgements enable row level security;
alter table public.audit_events enable row level security;

create policy orgs_select on public.orgs for select to authenticated
  using (public.is_org_member(id));
create policy orgs_update on public.orgs for update to authenticated
  using (public.is_org_member(id)) with check (public.is_org_member(id));

create policy org_members_select on public.org_members for select to authenticated
  using (public.is_org_member(org_id));

create policy categories_select on public.canonical_categories for select to authenticated
  using (true);

-- Engagement-scoped tables: full CRUD for org members, except where noted.
create policy engagements_all on public.engagements for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy documents_all on public.documents for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy accounts_all on public.accounts for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy facts_all on public.financial_facts for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy classifications_all on public.txn_classifications for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy adjustments_all on public.adjustments for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy evidence_all on public.adjustment_evidence for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy gates_all on public.gate_acknowledgements for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Transactions: immutable — members may insert, read, and delete (re-ingest), never update.
create policy transactions_select on public.transactions for select to authenticated
  using (public.is_org_member(org_id));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (public.is_org_member(org_id));
create policy transactions_delete on public.transactions for delete to authenticated
  using (public.is_org_member(org_id));

-- Audit log: append + read only.
create policy audit_insert on public.audit_events for insert to authenticated
  with check (public.is_org_member(org_id));
create policy audit_select on public.audit_events for select to authenticated
  using (public.is_org_member(org_id));

-- ── Storage ────────────────────────────────────────────────────────────────
-- Path convention: {org_id}/{engagement_id}/{document_id}/{file_name}

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy docs_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy docs_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy docs_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.is_org_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'documents' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy docs_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_org_member(((storage.foldername(name))[1])::uuid));
