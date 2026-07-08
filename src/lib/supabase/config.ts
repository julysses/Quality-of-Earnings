// Supabase connection values. Both are PUBLIC by design — the URL and the
// publishable (anon) key ship in client-side JS and are safe to commit; data
// access is enforced entirely by Row Level Security. Environment variables
// override these (e.g. to point a preview deployment at a branch database).

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://qwnmeltdckwgsrjxvons.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_2HeayprBxGwLemd2ZZzxpA_9YCnhOEM";
