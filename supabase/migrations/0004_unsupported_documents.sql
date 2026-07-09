-- Add an 'unsupported' document status, distinct from 'failed'. 'failed' means
-- we recognized the format and something unexpected went wrong parsing it;
-- 'unsupported' means we recognize the file (e.g. a QuickBooks Desktop
-- .QBB/.QBW backup) and know upfront we cannot read it — the UI shows
-- guidance instead of an error.

alter table public.documents drop constraint documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('uploaded','needs_review','confirmed','parsed','failed','unsupported'));
