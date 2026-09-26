-- Authenticated monetization funnel analytics.

create table if not exists public.monetization_events(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check(event_type in (
    'pricing_view',
    'checkout_start',
    'manual_upgrade_request',
    'promo_redeem',
    'subscription_active',
    'subscription_cancelled'
  )),
  plan_code public.plan_code,
  source text not null default 'arena',
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  event_date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  created_at timestamptz not null default now()
);

create index if not exists idx_monetization_events_type_date
  on public.monetization_events(event_type,event_date desc);

create index if not exists idx_monetization_events_user_date
  on public.monetization_events(user_id,event_date desc);

create unique index if not exists idx_monetization_events_daily_dedup
  on public.monetization_events(
    user_id,event_type,plan_code,source,event_date,reference_id
  ) nulls not distinct;

alter table public.monetization_events enable row level security;
revoke all on public.monetization_events from anon,authenticated;

create or replace function private.log_monetization_event(
  p_user_id uuid,
  p_event_type text,
  p_plan_code public.plan_code default null,
  p_source text default 'arena',
  p_reference_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
begin
  if p_user_id is null then return; end if;
  if p_event_type not in (
    'pricing_view','checkout_start','manual_upgrade_request',
    'promo_redeem','subscription_active','subscription_cancelled'
  ) then
    raise exception 'invalid_monetization_event';
  end if;

  insert into public.monetization_events(
    user_id,event_type,plan_code,source,reference_id,metadata
  )
  values(
    p_user_id,
    p_event_type,
    p_plan_code,
    left(coalesce(nullif(trim(p_source),''),'arena'),80),
    nullif(left(coalesce(p_reference_id,''),160),''),
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(
    user_id,event_type,plan_code,source,event_date,reference_id
  ) do nothing;
end
$$;

revoke all on function private.log_monetization_event(
  uuid,text,public.plan_code,text,text,jsonb
) from public,anon,authenticated;

create or replace function public.record_monetization_event(
  p_event_type text,
  p_plan_code public.plan_code default null,
  p_source text default 'arena'
)
returns boolean
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  if p_event_type not in ('pricing_view','checkout_start') then
    raise exception 'event_not_client_recordable';
  end if;

  perform private.log_monetization_event(
    uid,p_event_type,p_plan_code,p_source,null,'{}'::jsonb
  );

  return true;
end
$$;

revoke all on function public.record_monetization_event(
  text,public.plan_code,text
) from public,anon;
grant execute on function public.record_monetization_event(
  text,public.plan_code,text
) to authenticated;

create or replace function private.monetization_upgrade_request_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
begin
  perform private.log_monetization_event(
    new.user_id,
    'manual_upgrade_request',
    new.requested_plan,
    new.source,
    new.id::text,
    jsonb_build_object('status',new.status)
  );
  return new;
end
$$;

revoke all on function private.monetization_upgrade_request_trigger()
from public,anon,authenticated;

drop trigger if exists monetization_upgrade_request on public.upgrade_requests;
create trigger monetization_upgrade_request
after insert on public.upgrade_requests
for each row execute function private.monetization_upgrade_request_trigger();

create or replace function private.monetization_promo_redeem_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare p public.promo_codes;
begin
  select * into p from public.promo_codes where id=new.promo_id;

  perform private.log_monetization_event(
    new.user_id,
    'promo_redeem',
    p.grant_plan,
    'promo',
    new.promo_id::text,
    jsonb_build_object('code',p.code,'days',p.grant_days)
  );
  return new;
end
$$;

revoke all on function private.monetization_promo_redeem_trigger()
from public,anon,authenticated;

drop trigger if exists monetization_promo_redeem on public.promo_redemptions;
create trigger monetization_promo_redeem
after insert on public.promo_redemptions
for each row execute function private.monetization_promo_redeem_trigger();

create or replace function private.monetization_subscription_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare v_plan public.plan_code;
begin
  select code into v_plan
  from public.plans
  where id=new.plan_id;

  if new.status in ('active','trialing')
     and (
       tg_op='INSERT'
       or old.status is distinct from new.status
       or old.plan_id is distinct from new.plan_id
     )
  then
    perform private.log_monetization_event(
      new.user_id,
      'subscription_active',
      v_plan,
      coalesce(new.provider,'manual'),
      new.id::text,
      jsonb_build_object(
        'provider',new.provider,
        'external_id',new.external_id
      )
    );
  elsif new.status in ('canceled','unpaid','incomplete_expired','inactive')
     and tg_op='UPDATE'
     and old.status is distinct from new.status
  then
    perform private.log_monetization_event(
      new.user_id,
      'subscription_cancelled',
      v_plan,
      coalesce(new.provider,'manual'),
      new.id::text,
      jsonb_build_object(
        'provider',new.provider,
        'status',new.status
      )
    );
  end if;

  return new;
end
$$;

revoke all on function private.monetization_subscription_trigger()
from public,anon,authenticated;

drop trigger if exists monetization_subscription_event on public.subscriptions;
create trigger monetization_subscription_event
after insert or update of status,plan_id on public.subscriptions
for each row execute function private.monetization_subscription_trigger();

create or replace function public.admin_monetization_funnel(
  p_days integer default 30
)
returns table(
  window_days integer,
  pricing_view_users bigint,
  checkout_start_users bigint,
  manual_request_users bigint,
  promo_redeem_users bigint,
  subscription_active_users bigint,
  subscription_cancelled_users bigint,
  checkout_conversion_pct numeric,
  overall_conversion_pct numeric
)
language plpgsql
stable
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  v_days integer:=least(greatest(coalesce(p_days,30),1),365);
  v_from date:=(now() at time zone 'America/Sao_Paulo')::date-(least(greatest(coalesce(p_days,30),1),365)-1);
begin
  if uid is null or not private.is_admin(uid) then
    raise exception 'forbidden';
  end if;

  return query
  with agg as (
    select
      count(distinct user_id) filter(where event_type='pricing_view') pricing_views,
      count(distinct user_id) filter(where event_type='checkout_start') checkout_starts,
      count(distinct user_id) filter(where event_type='manual_upgrade_request') manual_requests,
      count(distinct user_id) filter(where event_type='promo_redeem') promo_redeems,
      count(distinct user_id) filter(where event_type='subscription_active') activations,
      count(distinct user_id) filter(where event_type='subscription_cancelled') cancellations
    from public.monetization_events
    where event_date>=v_from
  )
  select
    v_days,
    pricing_views,
    checkout_starts,
    manual_requests,
    promo_redeems,
    activations,
    cancellations,
    coalesce(round(100.0*activations/nullif(checkout_starts,0),2),0),
    coalesce(round(100.0*activations/nullif(pricing_views,0),2),0)
  from agg;
end
$$;

revoke all on function public.admin_monetization_funnel(integer)
from public,anon;
grant execute on function public.admin_monetization_funnel(integer)
to authenticated;

create or replace function public.admin_monetization_by_plan(
  p_days integer default 30
)
returns table(
  plan_code public.plan_code,
  pricing_views bigint,
  checkout_starts bigint,
  manual_requests bigint,
  promo_redeems bigint,
  activations bigint
)
language plpgsql
stable
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  v_from date:=(now() at time zone 'America/Sao_Paulo')::date-(least(greatest(coalesce(p_days,30),1),365)-1);
begin
  if uid is null or not private.is_admin(uid) then
    raise exception 'forbidden';
  end if;

  return query
  select
    p.code,
    count(distinct e.user_id) filter(where e.event_type='pricing_view'),
    count(distinct e.user_id) filter(where e.event_type='checkout_start'),
    count(distinct e.user_id) filter(where e.event_type='manual_upgrade_request'),
    count(distinct e.user_id) filter(where e.event_type='promo_redeem'),
    count(distinct e.user_id) filter(where e.event_type='subscription_active')
  from public.plans p
  left join public.monetization_events e
    on e.plan_code=p.code and e.event_date>=v_from
  where p.code<>'FREE'
  group by p.code
  order by private.plan_rank(p.code);
end
$$;

revoke all on function public.admin_monetization_by_plan(integer)
from public,anon;
grant execute on function public.admin_monetization_by_plan(integer)
to authenticated;
