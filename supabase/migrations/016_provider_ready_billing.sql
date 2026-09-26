-- Provider-ready billing for Stripe integration.

create table if not exists public.billing_provider_prices(
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  provider text not null check(provider in ('stripe')),
  external_product_id text,
  external_price_id text not null,
  currency text not null default 'brl',
  unit_amount_cents integer not null check(unit_amount_cents>=0),
  billing_interval text not null default 'month'
    check(billing_interval in ('month','year')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,external_price_id),
  unique(provider,plan_id,billing_interval)
);

create table if not exists public.billing_customers(
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check(provider in ('stripe')),
  external_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,provider),
  unique(provider,external_customer_id)
);

create table if not exists public.billing_events(
  id uuid primary key default gen_random_uuid(),
  provider text not null check(provider in ('stripe')),
  external_event_id text not null,
  event_type text not null,
  user_id uuid references public.profiles(id) on delete set null,
  external_subscription_id text,
  summary jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique(provider,external_event_id)
);

create index if not exists idx_billing_events_user_time
  on public.billing_events(user_id,processed_at desc);

alter table public.subscriptions
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

create unique index if not exists idx_subscriptions_provider_external
  on public.subscriptions(provider,external_id)
  where provider is not null and external_id is not null;

alter table public.billing_provider_prices enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_events enable row level security;

revoke all on public.billing_provider_prices from anon,authenticated;
revoke all on public.billing_customers from anon,authenticated;
revoke all on public.billing_events from anon,authenticated;

create or replace function public.get_checkout_offer(p_plan public.plan_code)
returns table(
  provider text,
  external_price_id text,
  unit_amount_cents integer,
  currency text,
  billing_interval text
)
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_plan='FREE' then raise exception 'invalid_target_plan'; end if;

  return query
  select
    bp.provider,
    bp.external_price_id,
    bp.unit_amount_cents,
    bp.currency,
    bp.billing_interval
  from public.billing_provider_prices bp
  join public.plans pl on pl.id=bp.plan_id
  where pl.code=p_plan
    and pl.active=true
    and bp.active=true
  order by case when bp.billing_interval='month' then 0 else 1 end
  limit 1;
end
$$;

revoke all on function public.get_checkout_offer(public.plan_code)
from public,anon;
grant execute on function public.get_checkout_offer(public.plan_code)
to authenticated;

create or replace function public.get_my_billing_status()
returns table(
  plan_code public.plan_code,
  subscription_status text,
  provider text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  external_customer_exists boolean,
  stripe_checkout_available boolean
)
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  return query
  select
    p.plan_code,
    s.status,
    s.provider,
    s.current_period_end,
    coalesce(s.cancel_at_period_end,false),
    exists(
      select 1
      from public.billing_customers bc
      where bc.user_id=uid and bc.provider='stripe'
    ),
    exists(
      select 1
      from public.billing_provider_prices bp
      join public.plans pl on pl.id=bp.plan_id
      where bp.provider='stripe'
        and bp.active=true
        and pl.active=true
        and pl.code in ('PRO','PRO_PLUS')
    )
  from public.profiles p
  left join lateral (
    select s1.*
    from public.subscriptions s1
    where s1.user_id=uid
    order by
      case when s1.status in ('active','trialing','past_due') then 0 else 1 end,
      coalesce(s1.updated_at,s1.created_at) desc
    limit 1
  ) s on true
  where p.id=uid;
end
$$;

revoke all on function public.get_my_billing_status()
from public,anon;
grant execute on function public.get_my_billing_status()
to authenticated;

create or replace function public.billing_link_stripe_customer(
  p_user_id uuid,
  p_customer_id text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  if p_user_id is null or nullif(trim(p_customer_id),'') is null then
    raise exception 'invalid_customer';
  end if;

  insert into public.billing_customers(
    user_id,provider,external_customer_id,updated_at
  )
  values(
    p_user_id,'stripe',trim(p_customer_id),now()
  )
  on conflict(user_id,provider) do update
    set external_customer_id=excluded.external_customer_id,
        updated_at=now();

  return true;
end
$$;

revoke all on function public.billing_link_stripe_customer(uuid,text)
from public,anon,authenticated;
grant execute on function public.billing_link_stripe_customer(uuid,text)
to service_role;

create or replace function public.billing_apply_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_inserted uuid;
  v_plan_id uuid;
  v_plan_code public.plan_code;
  v_effective_user uuid:=p_user_id;
  v_active boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  if nullif(trim(p_event_id),'') is null
     or nullif(trim(p_event_type),'') is null
     or nullif(trim(p_subscription_id),'') is null
  then
    raise exception 'invalid_event';
  end if;

  insert into public.billing_events(
    provider,external_event_id,event_type,user_id,
    external_subscription_id,summary
  )
  values(
    'stripe',p_event_id,p_event_type,p_user_id,
    p_subscription_id,coalesce(p_summary,'{}'::jsonb)
  )
  on conflict(provider,external_event_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  if v_effective_user is null
     and nullif(trim(coalesce(p_customer_id,'')),'') is not null
  then
    select user_id
    into v_effective_user
    from public.billing_customers
    where provider='stripe'
      and external_customer_id=p_customer_id
    limit 1;
  end if;

  if v_effective_user is null then
    raise exception 'billing_user_not_found';
  end if;

  if nullif(trim(coalesce(p_customer_id,'')),'') is not null then
    insert into public.billing_customers(
      user_id,provider,external_customer_id,updated_at
    )
    values(v_effective_user,'stripe',trim(p_customer_id),now())
    on conflict(user_id,provider) do update
      set external_customer_id=excluded.external_customer_id,
          updated_at=now();
  end if;

  if nullif(trim(coalesce(p_price_id,'')),'') is not null then
    select bp.plan_id,pl.code
    into v_plan_id,v_plan_code
    from public.billing_provider_prices bp
    join public.plans pl on pl.id=bp.plan_id
    where bp.provider='stripe'
      and bp.external_price_id=p_price_id
      and bp.active=true
    limit 1;
  end if;

  if v_plan_id is null then
    select s.plan_id,pl.code
    into v_plan_id,v_plan_code
    from public.subscriptions s
    join public.plans pl on pl.id=s.plan_id
    where s.provider='stripe'
      and s.external_id=p_subscription_id
    limit 1;
  end if;

  if v_plan_id is null then
    raise exception 'billing_price_not_mapped';
  end if;

  v_active:=p_status in ('active','trialing','past_due');

  if v_active then
    update public.subscriptions
    set status='inactive',
        ends_at=coalesce(ends_at,now()),
        updated_at=now()
    where user_id=v_effective_user
      and status='active'
      and not(provider='stripe' and external_id=p_subscription_id);
  end if;

  insert into public.subscriptions(
    user_id,plan_id,status,provider,external_id,
    starts_at,ends_at,current_period_end,cancel_at_period_end,updated_at
  )
  values(
    v_effective_user,
    v_plan_id,
    p_status,
    'stripe',
    p_subscription_id,
    now(),
    case when v_active then null else now() end,
    p_period_end,
    coalesce(p_cancel_at_period_end,false),
    now()
  )
  on conflict(provider,external_id)
    where provider is not null and external_id is not null
  do update set
    plan_id=excluded.plan_id,
    status=excluded.status,
    ends_at=excluded.ends_at,
    current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    updated_at=now();

  update public.billing_events
  set user_id=v_effective_user
  where id=v_inserted;

  if v_active then
    update public.profiles
    set plan_code=v_plan_code,updated_at=now()
    where id=v_effective_user;
  elsif p_status in ('canceled','unpaid','incomplete_expired') then
    update public.profiles
    set plan_code='FREE',updated_at=now()
    where id=v_effective_user;

    insert into public.notifications(user_id,type,title,body,payload)
    values(
      v_effective_user,
      'billing',
      'Plano alterado',
      'Sua assinatura premium não está mais ativa. Sua conta voltou ao plano FREE.',
      jsonb_build_object('provider','stripe','status',p_status)
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'duplicate',false,
    'user_id',v_effective_user,
    'plan',v_plan_code,
    'status',p_status
  );
end
$$;

revoke all on function public.billing_apply_stripe_subscription_event(
  text,text,uuid,text,text,text,text,timestamptz,boolean,jsonb
) from public,anon,authenticated;

grant execute on function public.billing_apply_stripe_subscription_event(
  text,text,uuid,text,text,text,text,timestamptz,boolean,jsonb
) to service_role;
