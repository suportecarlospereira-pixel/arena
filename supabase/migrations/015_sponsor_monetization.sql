-- ARENA sponsorship monetization.
-- Sponsored placements are explicitly labeled and are hidden for ad-free plans.

create table if not exists public.sponsor_campaigns(
  id uuid primary key default gen_random_uuid(),
  advertiser_name text not null,
  name text not null,
  headline text not null,
  body text,
  cta_label text not null default 'SAIBA MAIS',
  destination_url text not null,
  image_url text,
  placements text[] not null default array['home']::text[],
  priority integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(char_length(trim(advertiser_name)) between 2 and 100),
  check(char_length(trim(name)) between 2 and 120),
  check(char_length(trim(headline)) between 2 and 160),
  check(body is null or char_length(body)<=500),
  check(char_length(trim(cta_label)) between 2 and 40),
  check(destination_url like 'https://%'),
  check(image_url is null or image_url like 'https://%'),
  check(cardinality(placements)>=1),
  check(ends_at is null or ends_at>starts_at)
);

create index if not exists idx_sponsor_campaigns_active_window
  on public.sponsor_campaigns(active,starts_at,ends_at,priority desc);

create table if not exists public.sponsor_events(
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.sponsor_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check(event_type in ('impression','click')),
  placement text not null,
  event_date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  created_at timestamptz not null default now(),
  unique(campaign_id,user_id,event_type,placement,event_date)
);

create index if not exists idx_sponsor_events_campaign_date
  on public.sponsor_events(campaign_id,event_date,event_type);

alter table public.sponsor_campaigns enable row level security;
alter table public.sponsor_events enable row level security;

revoke all on public.sponsor_campaigns from anon,authenticated;
revoke all on public.sponsor_events from anon,authenticated;

create or replace function public.get_active_sponsor(p_placement text)
returns table(
  id uuid,
  advertiser_name text,
  headline text,
  body text,
  cta_label text,
  destination_url text,
  image_url text
)
language plpgsql
stable
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  v_plan public.plan_code;
  v_role public.app_role;
begin
  if uid is null then
    return;
  end if;

  select plan_code,role
  into v_plan,v_role
  from public.profiles
  where profiles.id=uid;

  if v_role in ('ADMIN','SUPER_ADMIN') then
    return;
  end if;

  if private.plan_feature_bool(v_plan,'ad_free',false) then
    return;
  end if;

  return query
  select
    c.id,
    c.advertiser_name,
    c.headline,
    c.body,
    c.cta_label,
    c.destination_url,
    c.image_url
  from public.sponsor_campaigns c
  where c.active=true
    and p_placement=any(c.placements)
    and c.starts_at<=now()
    and (c.ends_at is null or c.ends_at>now())
  order by c.priority desc,c.created_at desc
  limit 1;
end
$$;

revoke all on function public.get_active_sponsor(text)
from public,anon;
grant execute on function public.get_active_sponsor(text)
to authenticated;

create or replace function public.record_sponsor_event(
  p_campaign_id uuid,
  p_event_type text,
  p_placement text
)
returns boolean
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  v_plan public.plan_code;
  v_role public.app_role;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_event_type not in ('impression','click') then
    raise exception 'invalid_event';
  end if;
  if char_length(trim(coalesce(p_placement,'')))<1 then
    raise exception 'invalid_placement';
  end if;

  select plan_code,role
  into v_plan,v_role
  from public.profiles
  where id=uid;

  if v_role in ('ADMIN','SUPER_ADMIN')
     or private.plan_feature_bool(v_plan,'ad_free',false)
  then
    return false;
  end if;

  if not exists(
    select 1
    from public.sponsor_campaigns c
    where c.id=p_campaign_id
      and c.active=true
      and p_placement=any(c.placements)
      and c.starts_at<=now()
      and (c.ends_at is null or c.ends_at>now())
  ) then
    return false;
  end if;

  insert into public.sponsor_events(
    campaign_id,user_id,event_type,placement
  )
  values(
    p_campaign_id,uid,p_event_type,left(trim(p_placement),50)
  )
  on conflict(campaign_id,user_id,event_type,placement,event_date)
  do nothing;

  return true;
end
$$;

revoke all on function public.record_sponsor_event(uuid,text,text)
from public,anon;
grant execute on function public.record_sponsor_event(uuid,text,text)
to authenticated;

create or replace function public.admin_create_sponsor_campaign(
  p_advertiser_name text,
  p_name text,
  p_headline text,
  p_body text,
  p_cta_label text,
  p_destination_url text,
  p_image_url text,
  p_placements text[],
  p_priority integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  out_id uuid;
begin
  if uid is null or not private.is_admin(uid) then
    raise exception 'forbidden';
  end if;

  if p_destination_url not like 'https://%' then
    raise exception 'invalid_url';
  end if;

  if p_image_url is not null
     and p_image_url<>''
     and p_image_url not like 'https://%'
  then
    raise exception 'invalid_image_url';
  end if;

  insert into public.sponsor_campaigns(
    advertiser_name,name,headline,body,cta_label,destination_url,
    image_url,placements,priority,starts_at,ends_at,created_by
  )
  values(
    trim(p_advertiser_name),
    trim(p_name),
    trim(p_headline),
    nullif(trim(coalesce(p_body,'')),''),
    coalesce(nullif(trim(p_cta_label),''),'SAIBA MAIS'),
    trim(p_destination_url),
    nullif(trim(coalesce(p_image_url,'')),''),
    coalesce(p_placements,array['home']::text[]),
    coalesce(p_priority,0),
    coalesce(p_starts_at,now()),
    p_ends_at,
    uid
  )
  returning id into out_id;

  perform private.write_audit(
    uid,
    'create_sponsor_campaign',
    'sponsor_campaign',
    out_id::text,
    jsonb_build_object(
      'advertiser',p_advertiser_name,
      'placements',p_placements
    )
  );

  return out_id;
end
$$;

revoke all on function public.admin_create_sponsor_campaign(
  text,text,text,text,text,text,text,text[],integer,timestamptz,timestamptz
) from public,anon;

grant execute on function public.admin_create_sponsor_campaign(
  text,text,text,text,text,text,text,text[],integer,timestamptz,timestamptz
) to authenticated;

create or replace function public.admin_set_sponsor_campaign_active(
  p_campaign_id uuid,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null or not private.is_admin(uid) then
    raise exception 'forbidden';
  end if;

  update public.sponsor_campaigns
  set active=p_active,updated_at=now()
  where id=p_campaign_id;

  if not found then raise exception 'campaign_not_found'; end if;

  perform private.write_audit(
    uid,
    case
      when p_active then 'activate_sponsor_campaign'
      else 'deactivate_sponsor_campaign'
    end,
    'sponsor_campaign',
    p_campaign_id::text,
    jsonb_build_object('active',p_active)
  );

  return true;
end
$$;

revoke all on function public.admin_set_sponsor_campaign_active(uuid,boolean)
from public,anon;

grant execute on function public.admin_set_sponsor_campaign_active(uuid,boolean)
to authenticated;

create or replace function public.admin_list_sponsor_campaigns(
  p_limit integer default 100
)
returns table(
  id uuid,
  advertiser_name text,
  name text,
  headline text,
  destination_url text,
  placements text[],
  priority integer,
  active boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  impressions bigint,
  clicks bigint,
  ctr numeric
)
language plpgsql
stable
security definer
set search_path=public,private,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null or not private.is_admin(uid) then
    raise exception 'forbidden';
  end if;

  return query
  select
    c.id,
    c.advertiser_name,
    c.name,
    c.headline,
    c.destination_url,
    c.placements,
    c.priority,
    c.active,
    c.starts_at,
    c.ends_at,
    count(e.id) filter(where e.event_type='impression')::bigint,
    count(e.id) filter(where e.event_type='click')::bigint,
    coalesce(
      round(
        100.0*count(e.id) filter(where e.event_type='click')
        /nullif(count(e.id) filter(where e.event_type='impression'),0),
        2
      ),
      0
    )
  from public.sponsor_campaigns c
  left join public.sponsor_events e on e.campaign_id=c.id
  group by c.id
  order by c.created_at desc
  limit least(greatest(p_limit,1),500);
end
$$;

revoke all on function public.admin_list_sponsor_campaigns(integer)
from public,anon;

grant execute on function public.admin_list_sponsor_campaigns(integer)
to authenticated;
