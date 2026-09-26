-- ARENA monetization foundation.
-- Centralizes FREE/PRO/PRO+ entitlements, daily Arena AI quota,
-- league creation limits, advanced analytics and upgrade requests.

update public.plans
set features=jsonb_build_object(
  'predictions',true,
  'ranking',true,
  'social',true,
  'join_leagues',true,
  'ai_daily_limit',5,
  'league_create_limit',1,
  'advanced_stats',false,
  'ad_free',false,
  'priority',false
)
where code='FREE';

update public.plans
set features=jsonb_build_object(
  'predictions',true,
  'ranking',true,
  'social',true,
  'join_leagues',true,
  'ai_daily_limit',50,
  'league_create_limit',5,
  'advanced_stats',true,
  'ad_free',true,
  'priority',false
)
where code='PRO';

update public.plans
set features=jsonb_build_object(
  'predictions',true,
  'ranking',true,
  'social',true,
  'join_leagues',true,
  'ai_daily_limit',200,
  'league_create_limit',20,
  'advanced_stats',true,
  'ad_free',true,
  'priority',true
)
where code='PRO_PLUS';

create table if not exists public.feature_usage_daily(
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  feature text not null,
  usage_count integer not null default 0 check(usage_count>=0),
  updated_at timestamptz not null default now(),
  primary key(user_id,usage_date,feature)
);

create index if not exists idx_feature_usage_date_feature
  on public.feature_usage_daily(usage_date,feature);

alter table public.feature_usage_daily enable row level security;
revoke all on table public.feature_usage_daily from anon,authenticated;

create table if not exists public.upgrade_requests(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_plan public.plan_code not null,
  status text not null default 'PENDING'
    check(status in ('PENDING','CONTACTED','RESOLVED','CANCELLED')),
  source text not null default 'pricing_page',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(requested_plan<>'FREE')
);

create unique index if not exists idx_upgrade_requests_one_pending
  on public.upgrade_requests(user_id)
  where status='PENDING';

create index if not exists idx_upgrade_requests_status_created
  on public.upgrade_requests(status,created_at desc);

alter table public.upgrade_requests enable row level security;
revoke all on table public.upgrade_requests from anon,authenticated;

create or replace function private.plan_feature_int(
  p_plan public.plan_code,p_key text,p_default integer
)
returns integer
language sql stable security definer
set search_path=public,pg_catalog
as $$
  select coalesce(
    (
      select nullif(features->>p_key,'')::integer
      from public.plans
      where code=p_plan and active=true
      limit 1
    ),
    p_default
  );
$$;

revoke all on function private.plan_feature_int(public.plan_code,text,integer)
  from public,anon,authenticated;

create or replace function private.plan_feature_bool(
  p_plan public.plan_code,p_key text,p_default boolean
)
returns boolean
language sql stable security definer
set search_path=public,pg_catalog
as $$
  select coalesce(
    (
      select nullif(features->>p_key,'')::boolean
      from public.plans
      where code=p_plan and active=true
      limit 1
    ),
    p_default
  );
$$;

revoke all on function private.plan_feature_bool(public.plan_code,text,boolean)
  from public,anon,authenticated;

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
language plpgsql stable security definer
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

  select p.plan_code,p.role
  into v_plan,v_role
  from public.profiles p
  where p.id=uid;

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
    case when v_role in ('ADMIN','SUPER_ADMIN')
      then true
      else private.plan_feature_bool(v_plan,'advanced_stats',false)
    end,
    case when v_role in ('ADMIN','SUPER_ADMIN')
      then true
      else private.plan_feature_bool(v_plan,'ad_free',false)
    end,
    case when v_role in ('ADMIN','SUPER_ADMIN')
      then true
      else private.plan_feature_bool(v_plan,'priority',false)
    end,
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

revoke all on function public.get_my_entitlements() from public,anon;
grant execute on function public.get_my_entitlements() to authenticated;

create or replace function public.consume_feature_quota(p_feature text)
returns table(
  allowed boolean,
  usage_count integer,
  usage_limit integer,
  plan_code public.plan_code
)
language plpgsql security definer
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

  select p.plan_code,p.role
  into v_plan,v_role
  from public.profiles p
  where p.id=uid;

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
    select f.usage_count
    into v_used
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

revoke all on function public.consume_feature_quota(text) from public,anon;
grant execute on function public.consume_feature_quota(text) to authenticated;

create or replace function public.request_plan_upgrade(
  p_plan public.plan_code,p_source text default 'pricing_page'
)
returns uuid
language plpgsql security definer
set search_path=public,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  v_current public.plan_code;
  v_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_plan='FREE' then raise exception 'invalid_target_plan'; end if;

  select plan_code
  into v_current
  from public.profiles
  where id=uid;

  if v_current=p_plan then raise exception 'already_on_plan'; end if;

  update public.upgrade_requests
  set status='CANCELLED',updated_at=now()
  where user_id=uid and status='PENDING';

  insert into public.upgrade_requests(user_id,requested_plan,source)
  values(uid,p_plan,left(coalesce(p_source,'pricing_page'),80))
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.request_plan_upgrade(public.plan_code,text)
  from public,anon;
grant execute on function public.request_plan_upgrade(public.plan_code,text)
  to authenticated;

create or replace function public.cancel_plan_upgrade_request()
returns boolean
language plpgsql security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  update public.upgrade_requests
  set status='CANCELLED',updated_at=now()
  where user_id=uid and status='PENDING';

  return true;
end
$$;

revoke all on function public.cancel_plan_upgrade_request()
  from public,anon;
grant execute on function public.cancel_plan_upgrade_request()
  to authenticated;

create or replace function public.admin_list_upgrade_requests(
  p_status text default null,p_limit integer default 100
)
returns table(
  id uuid,user_id uuid,username text,name text,
  current_plan public.plan_code,requested_plan public.plan_code,
  status text,source text,note text,
  created_at timestamptz,updated_at timestamptz
)
language plpgsql stable security definer
set search_path=public,private,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null or not private.is_admin(uid) then
    raise exception 'forbidden';
  end if;

  return query
  select
    ur.id,ur.user_id,p.username::text,p.name,p.plan_code,
    ur.requested_plan,ur.status,ur.source,ur.note,
    ur.created_at,ur.updated_at
  from public.upgrade_requests ur
  join public.profiles p on p.id=ur.user_id
  where p_status is null or ur.status=p_status
  order by
    case when ur.status='PENDING' then 0 else 1 end,
    ur.created_at desc
  limit least(greatest(p_limit,1),500);
end
$$;

revoke all on function public.admin_list_upgrade_requests(text,integer)
  from public,anon;
grant execute on function public.admin_list_upgrade_requests(text,integer)
  to authenticated;

create or replace function public.admin_update_upgrade_request(
  p_request_id uuid,p_status text,p_note text default null
)
returns boolean
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null or not private.is_admin(uid) then
    raise exception 'forbidden';
  end if;

  if p_status not in ('PENDING','CONTACTED','RESOLVED','CANCELLED') then
    raise exception 'invalid_status';
  end if;

  update public.upgrade_requests
  set status=p_status,
      note=nullif(left(trim(coalesce(p_note,'')),500),''),
      updated_at=now()
  where id=p_request_id;

  if not found then raise exception 'request_not_found'; end if;

  perform private.write_audit(
    uid,
    'update_upgrade_request',
    'upgrade_request',
    p_request_id::text,
    jsonb_build_object('status',p_status)
  );

  return true;
end
$$;

revoke all on function public.admin_update_upgrade_request(uuid,text,text)
  from public,anon;
grant execute on function public.admin_update_upgrade_request(uuid,text,text)
  to authenticated;

create or replace function public.get_my_advanced_stats()
returns jsonb
language plpgsql stable security definer
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

  select plan_code,role
  into v_plan,v_role
  from public.profiles
  where id=uid;

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

revoke all on function public.get_my_advanced_stats() from public,anon;
grant execute on function public.get_my_advanced_stats() to authenticated;

create or replace function public.create_league(
  p_name text,p_description text default null,p_private boolean default true
)
returns public.leagues
language plpgsql security definer
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

  select plan_code,role
  into v_plan,v_role
  from public.profiles
  where id=uid;

  v_limit:=case
    when v_role in ('ADMIN','SUPER_ADMIN') then 1000
    else private.plan_feature_int(v_plan,'league_create_limit',1)
  end;

  select count(*)::integer
  into v_owned
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
