-- Harden SECURITY DEFINER function grants (security advisor lints 0028/0029):
-- anon/public must not execute them. authenticated keeps EXECUTE —
-- is_org_member() backs every RLS policy and bootstrap_org() is the intended
-- first-login entry point.

revoke execute on function public.is_org_member(uuid) from anon, public;
revoke execute on function public.bootstrap_org(text) from anon, public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.bootstrap_org(text) to authenticated;
