create or replace function public.admin_dashboard_stats()
returns table(users bigint, matches bigint, predictions bigint, premium bigint)
language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); r public.app_role;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select role into r from public.profiles where id=uid;
  if r not in ('ADMIN','SUPER_ADMIN') then raise exception 'forbidden'; end if;
  return query select
    (select count(*) from public.profiles),
    (select count(*) from public.matches),
    (select count(*) from public.predictions),
    (select count(*) from public.profiles where plan_code<>'FREE');
end $$;
revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
