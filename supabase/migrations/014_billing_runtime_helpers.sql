-- Runtime helpers used by billing/admin RPCs.

create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,private,pg_catalog
as $$
  select exists(
    select 1
    from public.profiles
    where id=p_user_id
      and role in ('ADMIN','SUPER_ADMIN')
  );
$$;

revoke all on function private.is_admin(uuid)
from public,anon,authenticated;

create or replace function private.write_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_after_data jsonb default null,
  p_before_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
begin
  insert into public.admin_audit_logs(
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  )
  values(
    p_actor_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_before_data,
    p_after_data
  );
end
$$;

revoke all on function private.write_audit(uuid,text,text,text,jsonb,jsonb)
from public,anon,authenticated;
