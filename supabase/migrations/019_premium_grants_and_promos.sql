-- Temporary premium grants and promo codes.

create table if not exists public.plan_grants(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_code public.plan_code not null check(plan_code<>'FREE'),
  source text not null,
  source_id text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check(ends_at>starts_at)
);

create unique index if not exists idx_plan_grants_source_unique
  on public.plan_grants(user_id,source,source_id)
  where source_id is not null;

create index if not exists idx_plan_grants_user_active
  on public.plan_grants(user_id,ends_at desc)
  where revoked_at is null;

create table if not exists public.promo_codes(
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  grant_plan public.plan_code not null check(grant_plan<>'FREE'),
  grant_days integer not null check(grant_days between 1 and 90),
  max_redemptions integer check(max_redemptions is null or max_redemptions>0),
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(code ~ '^[A-Za-z0-9_-]{4,32}$'),
  check(ends_at is null or ends_at>starts_at)
);

create unique index if not exists idx_promo_codes_upper_code
  on public.promo_codes(upper(code));

create index if not exists idx_promo_codes_created_by
  on public.promo_codes(created_by);

create table if not exists public.promo_redemptions(
  promo_id uuid not null references public.promo_codes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_grant_id uuid not null references public.plan_grants(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key(promo_id,user_id)
);

create index if not exists idx_promo_redemptions_user
  on public.promo_redemptions(user_id,redeemed_at desc);

create index if not exists idx_promo_redemptions_grant
  on public.promo_redemptions(plan_grant_id);

alter table public.plan_grants enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

revoke all on public.plan_grants from anon,authenticated;
revoke all on public.promo_codes from anon,authenticated;
revoke all on public.promo_redemptions from anon,authenticated;

create or replace function private.plan_rank(p_plan public.plan_code)
returns integer
language sql
immutable
set search_path=public,pg_catalog
as $$
  select case p_plan
    when 'PRO_PLUS' then 2
    when 'PRO' then 1
    else 0
  end;
$$;

revoke all on function private.plan_rank(public.plan_code)
from public,anon,authenticated;

create or replace function private.effective_plan(p_user_id uuid)
returns public.plan_code
language plpgsql
stable
security definer
set search_path=public,private,pg_catalog
as $$
declare
  v_base public.plan_code;
begin
  select plan_code into v_base
  from public.profiles
  where id=p_user_id;

  if v_base is null then
    return 'FREE';
  end if;

  if v_base='PRO_PLUS' or exists(
    select 1
    from public.plan_grants g
    where g.user_id=p_user_id
      and g.plan_code='PRO_PLUS'
      and g.revoked_at is null
      and g.starts_at<=now()
      and g.ends_at>now()
  ) then
    return 'PRO_PLUS';
  end if;

  if v_base='PRO' or exists(
    select 1
    from public.plan_grants g
    where g.user_id=p_user_id
      and g.plan_code='PRO'
      and g.revoked_at is null
      and g.starts_at<=now()
      and g.ends_at>now()
  ) then
    return 'PRO';
  end if;

  return 'FREE';
end
$$;

revoke all on function private.effective_plan(uuid)
from public,anon,authenticated;

create or replace function public.get_my_plan_status()
returns table(
  billing_plan_code public.plan_code,
  effective_plan_code public.plan_code,
  grant_plan_code public.plan_code,
  grant_source text,
  grant_ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public,private,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  return query
  select
    p.plan_code,
    private.effective_plan(uid),
    g.plan_code,
    g.source,
    g.ends_at
  from public.profiles p
  left join lateral (
    select pg.plan_code,pg.source,pg.ends_at
    from public.plan_grants pg
    where pg.user_id=uid
      and pg.revoked_at is null
      and pg.starts_at<=now()
      and pg.ends_at>now()
    order by private.plan_rank(pg.plan_code) desc,pg.ends_at desc
    limit 1
  ) g on true
  where p.id=uid;
end
$$;

revoke all on function public.get_my_plan_status()
from public,anon;
grant execute on function public.get_my_plan_status()
to authenticated;

create or replace function public.get_my_entitlements()
returns table(
  plan_code public.plan_code,
  plan_name text,
  price_cents integer,
  ai_daily_limit integer,
  ai_used_today integer,
  ai_remaining integer,
  league_create_limit integer,
  owned_leagues integer,
  advanced_stats boolean,
  ad_free boolean,
  priority boolean,
  pending_upgrade public.plan_code
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
  v_ai_limit integer;
  v_league_limit integer;
  v_ai_used integer;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select p.role into v_role
  from public.profiles p
  where p.id=uid;

  v_plan:=private.effective_plan(uid);

  if v_role in ('ADMIN','SUPER_ADMIN') then
    v_ai_limit:=10000;
    v_league_limit:=1000;
  else
    v_ai_limit:=private.plan_feature_int(v_plan,'ai_daily_limit',5);
    v_league_limit:=private.plan_feature_int(v_plan,'league_create_limit',1);
  end if;

  select coalesce(f.usage_count,0)
  into v_ai_used
  from public.feature_usage_daily f
  where f.user_id=uid
    and f.usage_date=(now() at time zone 'America/Sao_Paulo')::date
    and f.feature='arena_ai';

  v_ai_used:=coalesce(v_ai_used,0);

  return query
  select
    v_plan,
    pl.name,
    pl.price_cents,
    v_ai_limit,
    v_ai_used,
    greatest(0,v_ai_limit-v_ai_used),
    v_league_limit,
    (select count(*)::integer from public.leagues l where l.owner_id=uid),
    case when v_role in ('ADMIN','SUPER_ADMIN') then true else private.plan_feature_bool(v_plan,'advanced_stats',false) end,
    case when v_role in ('ADMIN','SUPER_ADMIN') then true else private.plan_feature_bool(v_plan,'ad_free',false) end,
    case when v_role in ('ADMIN','SUPER_ADMIN') then true else private.plan_feature_bool(v_plan,'priority',false) end,
    (
      select ur.requested_plan
      from public.upgrade_requests ur
      where ur.user_id=uid and ur.status='PENDING'
      order by ur.created_at desc
      limit 1
    )
  from public.plans pl
  where pl.code=v_plan
  limit 1;
end
$$;

revoke all on function public.get_my_entitlements()
from public,anon;
grant execute on function public.get_my_entitlements()
to authenticated;

create or replace function public.consume_feature_quota(p_feature text)
returns table(
  allowed boolean,
  usage_count integer,
  usage_limit integer,
  plan_code public.plan_code
)
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  v_plan public.plan_code;
  v_role public.app_role;
  v_limit integer;
  v_used integer;
  v_day date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_feature<>'arena_ai' then raise exception 'unsupported_feature'; end if;

  select role into v_role
  from public.profiles
  where id=uid;

  v_plan:=private.effective_plan(uid);

  v_limit:=case
    when v_role in ('ADMIN','SUPER_ADMIN') then 10000
    else private.plan_feature_int(v_plan,'ai_daily_limit',5)
  end;

  insert into public.feature_usage_daily(
    user_id,usage_date,feature,usage_count,updated_at
  )
  values(uid,v_day,p_feature,1,now())
  on conflict(user_id,usage_date,feature) do update
    set usage_count=public.feature_usage_daily.usage_count+1,
        updated_at=now()
    where public.feature_usage_daily.usage_count<v_limit
  returning public.feature_usage_daily.usage_count into v_used;

  if v_used is null then
    select f.usage_count into v_used
    from public.feature_usage_daily f
    where f.user_id=uid
      and f.usage_date=v_day
      and f.feature=p_feature;

    return query select false,coalesce(v_used,0),v_limit,v_plan;
    return;
  end if;

  return query select true,v_used,v_limit,v_plan;
end
$$;

revoke all on function public.consume_feature_quota(text)
from public,anon;
grant execute on function public.consume_feature_quota(text)
to authenticated;

create or replace function public.get_my_advanced_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  v_plan public.plan_code;
  v_role public.app_role;
  v_allowed boolean;
  v_result jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select role into v_role
  from public.profiles
  where id=uid;

  v_plan:=private.effective_plan(uid);

  v_allowed:=v_role in ('ADMIN','SUPER_ADMIN')
    or private.plan_feature_bool(v_plan,'advanced_stats',false);

  if not v_allowed then raise exception 'pro_required'; end if;

  select jsonb_build_object(
    'summary',jsonb_build_object(
      'predictions',count(pr.id),
      'settled',count(rr.id),
      'hits',count(rr.id) filter(where rr.result_correct),
      'exact',count(rr.id) filter(where rr.exact_score),
      'accuracy',coalesce(round(
        100.0*count(rr.id) filter(where rr.result_correct)
        /nullif(count(rr.id),0)
      )::int,0)
    ),
    'last30',(
      select jsonb_build_object(
        'predictions',count(pr2.id),
        'settled',count(rr2.id),
        'hits',count(rr2.id) filter(where rr2.result_correct),
        'accuracy',coalesce(round(
          100.0*count(rr2.id) filter(where rr2.result_correct)
          /nullif(count(rr2.id),0)
        )::int,0)
      )
      from public.predictions pr2
      left join public.prediction_results rr2 on rr2.prediction_id=pr2.id
      join public.matches m2 on m2.id=pr2.match_id
      where pr2.user_id=uid
        and m2.starts_at>=now()-interval '30 days'
    ),
    'by_pick',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'pick',x.pick,
        'predictions',x.predictions,
        'hits',x.hits,
        'accuracy',x.accuracy
      ) order by x.pick),'[]'::jsonb)
      from (
        select
          pr3.pick::text pick,
          count(*)::int predictions,
          count(rr3.id) filter(where rr3.result_correct)::int hits,
          coalesce(round(
            100.0*count(rr3.id) filter(where rr3.result_correct)
            /nullif(count(rr3.id),0)
          )::int,0) accuracy
        from public.predictions pr3
        left join public.prediction_results rr3 on rr3.prediction_id=pr3.id
        where pr3.user_id=uid
        group by pr3.pick
      ) x
    ),
    'by_competition',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'competition',x.competition,
        'predictions',x.predictions,
        'hits',x.hits,
        'exact',x.exact,
        'accuracy',x.accuracy
      ) order by x.predictions desc,x.competition),'[]'::jsonb)
      from (
        select
          c.name competition,
          count(pr4.id)::int predictions,
          count(rr4.id) filter(where rr4.result_correct)::int hits,
          count(rr4.id) filter(where rr4.exact_score)::int exact,
          coalesce(round(
            100.0*count(rr4.id) filter(where rr4.result_correct)
            /nullif(count(rr4.id),0)
          )::int,0) accuracy
        from public.predictions pr4
        join public.matches m4 on m4.id=pr4.match_id
        join public.competitions c on c.id=m4.competition_id
        left join public.prediction_results rr4 on rr4.prediction_id=pr4.id
        where pr4.user_id=uid
        group by c.id,c.name
        order by count(pr4.id) desc
        limit 12
      ) x
    )
  )
  into v_result
  from public.predictions pr
  left join public.prediction_results rr on rr.prediction_id=pr.id
  where pr.user_id=uid;

  return coalesce(v_result,'{}'::jsonb);
end
$$;

revoke all on function public.get_my_advanced_stats()
from public,anon;
grant execute on function public.get_my_advanced_stats()
to authenticated;

create or replace function public.create_league(
  p_name text,
  p_description text default null,
  p_private boolean default true
)
returns public.leagues
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  out_row public.leagues;
  v_plan public.plan_code;
  v_role public.app_role;
  v_limit integer;
  v_owned integer;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(coalesce(p_name,'')))<3 then raise exception 'invalid_name'; end if;

  select role into v_role
  from public.profiles
  where id=uid;

  v_plan:=private.effective_plan(uid);

  v_limit:=case
    when v_role in ('ADMIN','SUPER_ADMIN') then 1000
    else private.plan_feature_int(v_plan,'league_create_limit',1)
  end;

  select count(*)::integer into v_owned
  from public.leagues
  where owner_id=uid;

  if v_owned>=v_limit then raise exception 'league_limit_reached'; end if;

  insert into public.leagues(owner_id,name,description,is_private)
  values(uid,trim(p_name),nullif(trim(p_description),''),coalesce(p_private,true))
  returning * into out_row;

  insert into public.league_members(league_id,user_id,member_role)
  values(out_row.id,uid,'OWNER');

  perform private.log_activity(
    uid,'league_created','league',out_row.id::text,
    jsonb_build_object('name',out_row.name)
  );

  return out_row;
end
$$;

revoke all on function public.create_league(text,text,boolean)
from public,anon;
grant execute on function public.create_league(text,text,boolean)
to authenticated;

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
  if uid is null then return; end if;

  select role into v_role
  from public.profiles
  where id=uid;

  v_plan:=private.effective_plan(uid);

  if v_role in ('ADMIN','SUPER_ADMIN') then return; end if;

  if private.plan_feature_bool(v_plan,'ad_free',false) then
    return;
  end if;

  return query
  select
    c.id,c.advertiser_name,c.headline,c.body,
    c.cta_label,c.destination_url,c.image_url
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
  if p_event_type not in ('impression','click') then raise exception 'invalid_event'; end if;
  if char_length(trim(coalesce(p_placement,'')))<1 then raise exception 'invalid_placement'; end if;

  select role into v_role
  from public.profiles
  where id=uid;

  v_plan:=private.effective_plan(uid);

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

create or replace function public.redeem_promo_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  promo public.promo_codes;
  current_plan public.plan_code;
  redemption_count integer;
  grant_id uuid;
  grant_end timestamptz;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select *
  into promo
  from public.promo_codes
  where upper(code)=upper(trim(p_code))
  for update;

  if not found then raise exception 'promo_not_found'; end if;
  if not promo.active then raise exception 'promo_inactive'; end if;
  if promo.starts_at>now() then raise exception 'promo_not_started'; end if;
  if promo.ends_at is not null and promo.ends_at<=now() then
    raise exception 'promo_expired';
  end if;

  if exists(
    select 1
    from public.promo_redemptions
    where promo_id=promo.id and user_id=uid
  ) then
    raise exception 'promo_already_redeemed';
  end if;

  select count(*)::integer
  into redemption_count
  from public.promo_redemptions
  where promo_id=promo.id;

  if promo.max_redemptions is not null
     and redemption_count>=promo.max_redemptions
  then
    raise exception 'promo_limit_reached';
  end if;

  current_plan:=private.effective_plan(uid);

  if private.plan_rank(current_plan)>=private.plan_rank(promo.grant_plan) then
    raise exception 'already_on_equal_or_higher_plan';
  end if;

  grant_end:=now()+make_interval(days=>promo.grant_days);

  insert into public.plan_grants(
    user_id,plan_code,source,source_id,starts_at,ends_at,metadata
  )
  values(
    uid,promo.grant_plan,'promo',promo.id::text,now(),grant_end,
    jsonb_build_object('code',promo.code,'name',promo.name)
  )
  returning id into grant_id;

  insert into public.promo_redemptions(
    promo_id,user_id,plan_grant_id
  )
  values(promo.id,uid,grant_id);

  insert into public.notifications(
    user_id,type,title,body,payload
  )
  values(
    uid,
    'billing',
    'Benefício ativado ✨',
    'Seu acesso '||
      case when promo.grant_plan='PRO_PLUS' then 'PRO+' else promo.grant_plan::text end||
      ' está liberado por '||promo.grant_days||' dia(s).',
    jsonb_build_object(
      'plan',promo.grant_plan,
      'source','promo',
      'ends_at',grant_end
    )
  );

  return jsonb_build_object(
    'ok',true,
    'plan',promo.grant_plan,
    'days',promo.grant_days,
    'ends_at',grant_end
  );
end
$$;

revoke all on function public.redeem_promo_code(text)
from public,anon;
grant execute on function public.redeem_promo_code(text)
to authenticated;

create or replace function public.admin_create_promo_code(
  p_code text,
  p_name text,
  p_plan public.plan_code,
  p_days integer,
  p_max_redemptions integer default null,
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare uid uuid:=auth.uid(); out_id uuid; clean_code text:=upper(trim(p_code));
begin
  if uid is null or not private.is_admin(uid) then
    raise exception 'forbidden';
  end if;

  if clean_code !~ '^[A-Z0-9_-]{4,32}$' then
    raise exception 'invalid_code';
  end if;
  if p_plan='FREE' then raise exception 'invalid_plan'; end if;
  if p_days<1 or p_days>90 then raise exception 'invalid_days'; end if;
  if p_max_redemptions is not null and p_max_redemptions<1 then
    raise exception 'invalid_limit';
  end if;

  insert into public.promo_codes(
    code,name,grant_plan,grant_days,max_redemptions,
    starts_at,ends_at,created_by
  )
  values(
    clean_code,trim(p_name),p_plan,p_days,p_max_redemptions,
    coalesce(p_starts_at,now()),p_ends_at,uid
  )
  returning id into out_id;

  perform private.write_audit(
    uid,
    'create_promo_code',
    'promo_code',
    out_id::text,
    jsonb_build_object(
      'code',clean_code,
      'plan',p_plan,
      'days',p_days,
      'max_redemptions',p_max_redemptions
    )
  );

  return out_id;
end
$$;

revoke all on function public.admin_create_promo_code(
  text,text,public.plan_code,integer,integer,timestamptz,timestamptz
) from public,anon;

grant execute on function public.admin_create_promo_code(
  text,text,public.plan_code,integer,integer,timestamptz,timestamptz
) to authenticated;

create or replace function public.admin_set_promo_active(
  p_promo_id uuid,
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

  update public.promo_codes
  set active=p_active,updated_at=now()
  where id=p_promo_id;

  if not found then raise exception 'promo_not_found'; end if;

  perform private.write_audit(
    uid,
    case when p_active then 'activate_promo' else 'deactivate_promo' end,
    'promo_code',
    p_promo_id::text,
    jsonb_build_object('active',p_active)
  );

  return true;
end
$$;

revoke all on function public.admin_set_promo_active(uuid,boolean)
from public,anon;
grant execute on function public.admin_set_promo_active(uuid,boolean)
to authenticated;

create or replace function public.admin_list_promo_codes(
  p_limit integer default 100
)
returns table(
  id uuid,
  code text,
  name text,
  grant_plan public.plan_code,
  grant_days integer,
  max_redemptions integer,
  redemptions bigint,
  active boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz
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
    p.id,p.code,p.name,p.grant_plan,p.grant_days,p.max_redemptions,
    count(r.user_id)::bigint,p.active,p.starts_at,p.ends_at,p.created_at
  from public.promo_codes p
  left join public.promo_redemptions r on r.promo_id=p.id
  group by p.id
  order by p.created_at desc
  limit least(greatest(p_limit,1),500);
end
$$;

revoke all on function public.admin_list_promo_codes(integer)
from public,anon;
grant execute on function public.admin_list_promo_codes(integer)
to authenticated;
