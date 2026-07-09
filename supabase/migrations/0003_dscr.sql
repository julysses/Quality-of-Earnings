-- DSCR (Debt Service Coverage Ratio) lender module.
-- One editable deal structure per engagement — up to three debt tranches
-- (senior, seller note, existing debt to be refinanced/assumed) plus the
-- purchase price and equity injection. RLS follows the same org-membership
-- pattern as every other engagement-scoped table.

create table public.deal_structures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  engagement_id uuid not null unique references public.engagements(id) on delete cascade,

  purchase_price_cents bigint not null check (purchase_price_cents >= 0),
  equity_injection_cents bigint not null check (equity_injection_cents >= 0),

  -- Senior debt (e.g. SBA 7(a) or conventional acquisition loan)
  senior_debt_cents bigint not null default 0 check (senior_debt_cents >= 0),
  senior_rate_bps int not null default 0 check (senior_rate_bps >= 0),        -- basis points, e.g. 950 = 9.50%
  senior_term_months int not null default 0 check (senior_term_months >= 0),

  -- Seller note (often subordinated, may carry an interest-only period)
  seller_note_cents bigint not null default 0 check (seller_note_cents >= 0),
  seller_note_rate_bps int not null default 0 check (seller_note_rate_bps >= 0),
  seller_note_term_months int not null default 0 check (seller_note_term_months >= 0),
  seller_note_io_months int not null default 0 check (seller_note_io_months >= 0),

  -- Existing debt the buyer assumes or that survives the transaction
  existing_debt_cents bigint not null default 0 check (existing_debt_cents >= 0),
  existing_debt_rate_bps int not null default 0 check (existing_debt_rate_bps >= 0),
  existing_debt_term_months int not null default 0 check (existing_debt_term_months >= 0),

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deal_structures enable row level security;

create policy deal_structures_all on public.deal_structures for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
