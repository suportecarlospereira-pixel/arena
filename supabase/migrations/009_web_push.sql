-- ARENA Web Push infrastructure.
-- VAPID keys and dispatcher secrets are provisioned separately in Supabase Vault.
-- Never commit their values to source control.

alter table public.notifications add column if not exists dedup_key text;

create unique index if not exists idx_notifications_user_dedup
  on public.notifications(user_id,dedup_key)
  where dedup_key is not null;

create table if not exists public.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions(user_id,updated_at desc);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon,authenticated;

create or replace function public.get_push_public_key()
returns text
language sql stable security definer
set search_path=vault,pg_catalog
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='arena_vapid_public'
  limit 1;
$$;

revoke all on function public.get_push_public_key() from public;
grant execute on function public.get_push_public_key() to anon,authenticated;

create or replace function public.save_push_subscription(
  p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default null
)
returns uuid
language plpgsql security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid(); out_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_endpoint is null or p_endpoint not like 'https://%' then
    raise exception 'invalid_endpoint';
  end if;
  if length(coalesce(p_p256dh,''))<20 or length(coalesce(p_auth,''))<10 then
    raise exception 'invalid_subscription';
  end if;

  insert into public.push_subscriptions(
    user_id,endpoint,p256dh,auth,user_agent,updated_at
  )
  values(
    uid,p_endpoint,p_p256dh,p_auth,left(p_user_agent,500),now()
  )
  on conflict(endpoint) do update
    set user_id=excluded.user_id,
        p256dh=excluded.p256dh,
        auth=excluded.auth,
        user_agent=excluded.user_agent,
        updated_at=now()
  returning id into out_id;

  return out_id;
end
$$;

revoke all on function public.save_push_subscription(text,text,text,text)
  from public,anon;
grant execute on function public.save_push_subscription(text,text,text,text)
  to authenticated;

create or replace function public.remove_push_subscription(p_endpoint text)
returns boolean
language plpgsql security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  delete from public.push_subscriptions
  where user_id=uid and endpoint=p_endpoint;

  return true;
end
$$;

revoke all on function public.remove_push_subscription(text) from public,anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

create or replace function public.push_subscription_status()
returns integer
language sql stable security definer
set search_path=public,pg_catalog
as $$
  select case
    when auth.uid() is null then 0
    else (
      select count(*)::integer
      from public.push_subscriptions
      where user_id=auth.uid()
    )
  end;
$$;

revoke all on function public.push_subscription_status() from public,anon;
grant execute on function public.push_subscription_status() to authenticated;

create or replace function public.get_push_dispatch_secrets()
returns jsonb
language plpgsql stable security definer
set search_path=vault,pg_catalog
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  return jsonb_build_object(
    'shared_secret',(
      select decrypted_secret from vault.decrypted_secrets
      where name='arena_push_shared_secret' limit 1
    ),
    'vapid_public',(
      select decrypted_secret from vault.decrypted_secrets
      where name='arena_vapid_public' limit 1
    ),
    'vapid_private',(
      select decrypted_secret from vault.decrypted_secrets
      where name='arena_vapid_private' limit 1
    )
  );
end
$$;

revoke all on function public.get_push_dispatch_secrets()
  from public,anon,authenticated;
grant execute on function public.get_push_dispatch_secrets() to service_role;

create or replace function private.enqueue_push_notification()
returns trigger
language plpgsql security definer
set search_path=public,private,vault,net,pg_catalog
as $$
declare
  v_shared text;
  v_publishable text;
begin
  if not exists(
    select 1 from public.push_subscriptions ps
    where ps.user_id=new.user_id
  ) then
    return new;
  end if;

  select decrypted_secret into v_shared
  from vault.decrypted_secrets
  where name='arena_push_shared_secret'
  limit 1;

  select decrypted_secret into v_publishable
  from vault.decrypted_secrets
  where name='arena_publishable_key'
  limit 1;

  if v_shared is null or v_publishable is null then
    return new;
  end if;

  perform net.http_post(
    url:='https://jpdjwcxlxvlgqgbresae.supabase.co/functions/v1/arena-push',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||v_publishable,
      'x-arena-push-secret',v_shared
    ),
    body:=jsonb_build_object('notification_id',new.id),
    timeout_milliseconds:=5000
  );

  return new;
end
$$;

revoke all on function private.enqueue_push_notification()
  from public,anon,authenticated;

drop trigger if exists notification_push_dispatch on public.notifications;
create trigger notification_push_dispatch
after insert on public.notifications
for each row execute function private.enqueue_push_notification();

create or replace function private.create_match_reminders()
returns integer
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
declare inserted_count integer:=0;
begin
  insert into public.notifications(
    user_id,type,title,body,payload,dedup_key
  )
  select
    p.id,
    'match_reminder',
    'Palpite fecha em breve ⏰',
    t.name||' joga às '||
      to_char(m.starts_at at time zone 'America/Sao_Paulo','HH24:MI')||
      '. Faça seu palpite antes do início.',
    jsonb_build_object(
      'match_id',m.id,
      'team_id',p.favorite_team_id
    ),
    'favorite-match:'||m.id::text
  from public.profiles p
  join public.matches m
    on p.favorite_team_id in (m.home_team_id,m.away_team_id)
  join public.teams t on t.id=p.favorite_team_id
  where p.favorite_team_id is not null
    and m.status='SCHEDULED'
    and m.starts_at>now()+interval '15 minutes'
    and m.starts_at<=now()+interval '20 minutes'
    and not exists(
      select 1 from public.predictions pr
      where pr.user_id=p.id and pr.match_id=m.id
    )
  on conflict(user_id,dedup_key)
    where dedup_key is not null
  do nothing;

  get diagnostics inserted_count=row_count;
  return inserted_count;
end
$$;

revoke all on function private.create_match_reminders()
  from public,anon,authenticated;

select cron.schedule(
  'arena-favorite-team-reminders',
  '*/5 * * * *',
  'select private.create_match_reminders();'
);
