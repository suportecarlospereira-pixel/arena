-- ARENA production hardening snapshot
-- Reconciles all production schema/function changes made after 005_real_sports_sync.sql.
-- This file is intentionally idempotent where practical.

create schema if not exists private;

alter table public.matches add column if not exists provider_updated_at timestamptz;
alter table public.matches add column if not exists final_score_first_seen_at timestamptz;
alter table public.matches add column if not exists result_confirmed_at timestamptz;
alter table public.matches add column if not exists result_confirmation_count integer not null default 0;
alter table public.matches add column if not exists result_disputed boolean not null default false;
alter table public.matches add column if not exists result_locked boolean not null default false;
alter table public.matches add column if not exists result_revision integer not null default 0;

alter table public.prediction_results add column if not exists settlement_revision integer not null default 0;
alter table public.prediction_results add column if not exists settled_home_score integer;
alter table public.prediction_results add column if not exists settled_away_score integer;
alter table public.prediction_results add column if not exists updated_at timestamptz not null default now();

create table if not exists private.prediction_rate_limits (
  user_id uuid primary key,
  window_started_at timestamptz not null default now(),
  action_count integer not null default 0
);

create table if not exists private.match_result_observations (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  provider text not null,
  provider_match_id text,
  observed_at timestamptz not null default now(),
  status public.match_status not null,
  home_score integer,
  away_score integer
);

create index if not exists idx_result_observations_match_time
  on private.match_result_observations(match_id,observed_at desc);

create table if not exists private.system_alerts (
  alert_key text primary key,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

insert into public.achievements(code,name,description,xp_reward,criteria)
values
  ('HUNDRED_HITS','100 Acertos','Acerte 100 resultados',500,'{"hits":100}'::jsonb),
  ('FIVE_EXACT','5 Placares Exatos','Acerte 5 placares exatos',250,'{"exact":5}'::jsonb),
  ('THIRTY_DAY_STREAK','30 Dias','Mantenha uma sequência de 30 dias',500,'{"streak":30}'::jsonb)
on conflict(code) do update
set name=excluded.name,
    description=excluded.description,
    xp_reward=excluded.xp_reward,
    criteria=excluded.criteria;

CREATE OR REPLACE FUNCTION private.current_admin_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
  select role from public.profiles where id=auth.uid();
$function$


CREATE OR REPLACE FUNCTION private.check_prediction_rate_limit(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'pg_catalog'
AS $function$
declare
  r private.prediction_rate_limits;
begin
  insert into private.prediction_rate_limits(user_id,window_started_at,action_count)
  values(p_user_id,now(),0)
  on conflict(user_id) do nothing;

  select * into r
  from private.prediction_rate_limits
  where user_id=p_user_id
  for update;

  if r.window_started_at < now()-interval '1 minute' then
    update private.prediction_rate_limits
    set window_started_at=now(),action_count=1
    where user_id=p_user_id;
    return;
  end if;

  if r.action_count >= 30 then
    raise exception 'rate_limited';
  end if;

  update private.prediction_rate_limits
  set action_count=action_count+1
  where user_id=p_user_id;
end
$function$


CREATE OR REPLACE FUNCTION private.refresh_user_achievements(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_predictions integer;
  v_hits integer;
  v_exact integer;
  v_streak integer;
  v_achievement record;
  v_inserted integer := 0;
  v_unlock boolean;
  v_xp_id uuid;
begin
  select count(*) into v_predictions from public.predictions where user_id=p_user_id;

  select
    count(*) filter(where pr.result_correct),
    count(*) filter(where pr.exact_score)
  into v_hits,v_exact
  from public.prediction_results pr
  join public.predictions p on p.id=pr.prediction_id
  where p.user_id=p_user_id;

  select current_streak into v_streak from public.profiles where id=p_user_id;

  for v_achievement in
    select * from public.achievements where active=true
  loop
    v_unlock := case v_achievement.code
      when 'FIRST_PREDICTION' then v_predictions >= 1
      when 'TEN_HITS' then v_hits >= 10
      when 'HUNDRED_HITS' then v_hits >= 100
      when 'FIVE_EXACT' then v_exact >= 5
      when 'SEVEN_DAY_STREAK' then v_streak >= 7
      when 'THIRTY_DAY_STREAK' then v_streak >= 30
      else false
    end;

    if v_unlock then
      insert into public.user_achievements(user_id,achievement_id)
      values(p_user_id,v_achievement.id)
      on conflict do nothing;

      if found then
        v_inserted := v_inserted + 1;

        insert into public.xp_transactions(user_id,amount,reason,metadata,idempotency_key)
        values(
          p_user_id,
          v_achievement.xp_reward,
          'achievement_unlocked',
          jsonb_build_object('achievement_id',v_achievement.id,'code',v_achievement.code),
          p_user_id::text||':achievement:'||v_achievement.id::text
        )
        on conflict(idempotency_key) do nothing
        returning id into v_xp_id;

        if v_xp_id is not null and v_achievement.xp_reward <> 0 then
          update public.profiles
          set xp=xp+v_achievement.xp_reward,updated_at=now()
          where id=p_user_id;
        end if;
      end if;
    end if;
  end loop;

  return v_inserted;
end
$function$


CREATE OR REPLACE FUNCTION private.refresh_active_challenges(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  c record;
  v_count integer;
  v_completed integer := 0;
  v_xp_id uuid;
begin
  for c in
    select *
    from public.challenges
    where active=true
      and (starts_at is null or starts_at<=now())
      and (ends_at is null or ends_at>now())
  loop
    select count(*) into v_count
    from public.predictions
    where user_id=p_user_id
      and created_at>=coalesce(c.starts_at,'epoch'::timestamptz)
      and created_at<coalesce(c.ends_at,'infinity'::timestamptz);

    insert into public.challenge_entries(challenge_id,user_id,progress,updated_at)
    values(c.id,p_user_id,jsonb_build_object('predictions',v_count),now())
    on conflict(challenge_id,user_id) do update
      set progress=excluded.progress,updated_at=now();

    if v_count>=coalesce((c.criteria->>'predictions')::integer,999999) then
      update public.challenge_entries
      set completed_at=coalesce(completed_at,now())
      where challenge_id=c.id
        and user_id=p_user_id
        and completed_at is null;

      if found then
        v_completed:=v_completed+1;

        insert into public.xp_transactions(user_id,amount,reason,metadata,idempotency_key)
        values(
          p_user_id,
          c.xp_reward,
          'challenge_completed',
          jsonb_build_object('challenge_id',c.id),
          p_user_id::text||':challenge:'||c.id::text
        )
        on conflict(idempotency_key) do nothing
        returning id into v_xp_id;

        if v_xp_id is not null and c.xp_reward<>0 then
          update public.profiles
          set xp=xp+c.xp_reward,updated_at=now()
          where id=p_user_id;
        end if;
      end if;
    end if;
  end loop;

  return v_completed;
end
$function$


CREATE OR REPLACE FUNCTION private.ensure_recurring_challenges()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_today_start timestamptz :=
    date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_today_end timestamptz := v_today_start+interval '1 day';
  v_week_start timestamptz :=
    date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_week_end timestamptz := v_week_start+interval '7 days';
  v_created integer:=0;
begin
  if not exists(
    select 1 from public.challenges
    where type='daily'
      and starts_at=v_today_start
      and ends_at=v_today_end
  ) then
    insert into public.challenges(name,type,description,xp_reward,criteria,starts_at,ends_at,active)
    values(
      '3 palpites hoje',
      'daily',
      'Faça 3 palpites válidos hoje',
      100,
      '{"predictions":3}'::jsonb,
      v_today_start,
      v_today_end,
      true
    );
    v_created:=v_created+1;
  end if;

  if not exists(
    select 1 from public.challenges
    where type='weekly'
      and starts_at=v_week_start
      and ends_at=v_week_end
  ) then
    insert into public.challenges(name,type,description,xp_reward,criteria,starts_at,ends_at,active)
    values(
      '10 palpites na semana',
      'weekly',
      'Faça 10 palpites válidos nesta semana',
      250,
      '{"predictions":10}'::jsonb,
      v_week_start,
      v_week_end,
      true
    );
    v_created:=v_created+1;
  end if;

  update public.challenges
  set active=false
  where active=true
    and ends_at is not null
    and ends_at<=now();

  return v_created;
end
$function$


CREATE OR REPLACE FUNCTION private.complete_referral_if_eligible(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  r public.referrals;
  v_ref_xp_id uuid;
  v_user_xp_id uuid;
begin
  select * into r
  from public.referrals
  where referred_id=p_user_id and status='pending'
  for update;

  if not found then return false; end if;

  if not exists(select 1 from public.predictions where user_id=p_user_id) then
    return false;
  end if;

  update public.referrals
  set status='completed',completed_at=now()
  where id=r.id;

  insert into public.xp_transactions(user_id,amount,reason,metadata,idempotency_key)
  values(
    r.referrer_id,
    r.reward_xp,
    'referral_completed',
    jsonb_build_object('referral_id',r.id,'referred_id',p_user_id),
    r.referrer_id::text||':referral:'||r.id::text
  )
  on conflict(idempotency_key) do nothing
  returning id into v_ref_xp_id;

  if v_ref_xp_id is not null then
    update public.profiles set xp=xp+r.reward_xp,updated_at=now() where id=r.referrer_id;
  end if;

  insert into public.xp_transactions(user_id,amount,reason,metadata,idempotency_key)
  values(
    p_user_id,
    50,
    'referral_welcome',
    jsonb_build_object('referral_id',r.id,'referrer_id',r.referrer_id),
    p_user_id::text||':referral-welcome:'||r.id::text
  )
  on conflict(idempotency_key) do nothing
  returning id into v_user_xp_id;

  if v_user_xp_id is not null then
    update public.profiles set xp=xp+50,updated_at=now() where id=p_user_id;
  end if;

  insert into public.notifications(user_id,type,title,body,payload)
  values(
    r.referrer_id,'referral','Indicação concluída','Sua indicação entrou na Arena e completou o primeiro palpite. +100 XP.',
    jsonb_build_object('referral_id',r.id)
  );

  insert into public.notifications(user_id,type,title,body,payload)
  values(
    p_user_id,'referral','Bônus de boas-vindas','Seu primeiro palpite ativou o bônus de indicação. +50 XP.',
    jsonb_build_object('referral_id',r.id)
  );

  return true;
end
$function$


CREATE OR REPLACE FUNCTION private.request_espn_offset_range(p_start_offset integer, p_end_offset integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_catalog'
AS $function$
declare
  v_league text;
  v_request_id bigint;
  v_day integer;
  v_date text;
  v_count integer := 0;
begin
  if p_start_offset < -7 or p_end_offset > 45 or p_start_offset > p_end_offset then
    raise exception 'invalid_date_window';
  end if;

  for v_day in p_start_offset..p_end_offset
  loop
    v_date := to_char((now() at time zone 'America/Sao_Paulo')::date + v_day,'YYYYMMDD');

    foreach v_league in array array[
      'bra.1',
      'bra.2',
      'bra.copa_do_brazil',
      'conmebol.libertadores',
      'conmebol.sudamericana'
    ]
    loop
      select net.http_get(
        url := 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/' || v_league || '/scoreboard?dates=' || v_date,
        timeout_milliseconds := 10000
      ) into v_request_id;

      insert into private.sports_sync_requests(request_id,league)
      values(v_request_id,v_league)
      on conflict(request_id) do nothing;

      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end
$function$


CREATE OR REPLACE FUNCTION private.request_espn_dates(p_days_back integer, p_days_forward integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_catalog'
AS $function$
declare
  v_league text;
  v_request_id bigint;
  v_day integer;
  v_date text;
  v_count integer := 0;
begin
  if p_days_back < 0 or p_days_back > 7 or p_days_forward < 0 or p_days_forward > 45 then
    raise exception 'invalid_date_window';
  end if;

  for v_day in -p_days_back..p_days_forward
  loop
    v_date := to_char((now() at time zone 'America/Sao_Paulo')::date + v_day,'YYYYMMDD');

    foreach v_league in array array[
      'bra.1',
      'bra.2',
      'bra.copa_do_brazil',
      'conmebol.libertadores',
      'conmebol.sudamericana'
    ]
    loop
      select net.http_get(
        url := 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/' || v_league || '/scoreboard?dates=' || v_date,
        timeout_milliseconds := 10000
      ) into v_request_id;

      insert into private.sports_sync_requests(request_id,league)
      values(v_request_id,v_league)
      on conflict(request_id) do nothing;

      v_count := v_count + 1;
    end loop;
  end loop;

  delete from private.sports_sync_requests
  where requested_at < now() - interval '2 days';

  return v_count;
end
$function$


CREATE OR REPLACE FUNCTION private.ingest_espn_payload(p_league text, p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_competition_id uuid;
  v_event jsonb;
  v_comp jsonb;
  v_home jsonb;
  v_away jsonb;
  v_home_id uuid;
  v_away_id uuid;
  v_match_id uuid;
  v_home_provider_id text;
  v_away_provider_id text;
  v_home_name text;
  v_away_name text;
  v_home_abbr text;
  v_away_abbr text;
  v_home_logo text;
  v_away_logo text;
  v_status public.match_status;
  v_status_name text;
  v_status_state text;
  v_home_score integer;
  v_away_score integer;
  v_count integer:=0;
  v_comp_name text;
  v_comp_slug text;
  v_disputed boolean;
  v_alert_rows integer;
begin
  v_comp_name:=case p_league
    when 'bra.1' then 'Brasileirão Série A'
    when 'bra.2' then 'Brasileirão Série B'
    when 'bra.copa_do_brazil' then 'Copa do Brasil'
    when 'conmebol.libertadores' then 'CONMEBOL Libertadores'
    when 'conmebol.sudamericana' then 'CONMEBOL Sul-Americana'
    else p_league
  end;

  v_comp_slug:=case p_league
    when 'bra.1' then 'brasileirao'
    when 'bra.2' then 'brasileirao-serie-b'
    when 'bra.copa_do_brazil' then 'copa-do-brasil'
    when 'conmebol.libertadores' then 'libertadores'
    when 'conmebol.sudamericana' then 'sul-americana'
    else replace(p_league,'.','-')
  end;

  insert into public.competitions(name,slug,country,provider,provider_id,active)
  values(v_comp_name,v_comp_slug,'Brasil','espn',p_league,true)
  on conflict(slug) do update
    set name=excluded.name,
        provider=excluded.provider,
        provider_id=excluded.provider_id,
        active=true
  returning id into v_competition_id;

  for v_event in
    select value from jsonb_array_elements(coalesce(p_payload->'events','[]'::jsonb))
  loop
    v_comp:=v_event->'competitions'->0;

    select value into v_home
    from jsonb_array_elements(coalesce(v_comp->'competitors','[]'::jsonb))
    where value->>'homeAway'='home'
    limit 1;

    select value into v_away
    from jsonb_array_elements(coalesce(v_comp->'competitors','[]'::jsonb))
    where value->>'homeAway'='away'
    limit 1;

    if v_home is null or v_away is null then
      continue;
    end if;

    v_home_provider_id:=v_home->'team'->>'id';
    v_away_provider_id:=v_away->'team'->>'id';
    v_home_name:=coalesce(v_home->'team'->>'displayName',v_home->'team'->>'name','Time mandante');
    v_away_name:=coalesce(v_away->'team'->>'displayName',v_away->'team'->>'name','Time visitante');
    v_home_abbr:=coalesce(v_home->'team'->>'abbreviation',left(v_home_name,3));
    v_away_abbr:=coalesce(v_away->'team'->>'abbreviation',left(v_away_name,3));
    v_home_logo:=coalesce(v_home->'team'->>'logo',v_home->'team'->'logos'->0->>'href');
    v_away_logo:=coalesce(v_away->'team'->>'logo',v_away->'team'->'logos'->0->>'href');

    insert into public.teams(name,short_name,slug,crest_url,country,provider,provider_id)
    values(v_home_name,v_home_abbr,'espn-'||v_home_provider_id,v_home_logo,'Brasil','espn',v_home_provider_id)
    on conflict(provider,provider_id) do update
      set name=excluded.name,short_name=excluded.short_name,crest_url=excluded.crest_url
    returning id into v_home_id;

    insert into public.teams(name,short_name,slug,crest_url,country,provider,provider_id)
    values(v_away_name,v_away_abbr,'espn-'||v_away_provider_id,v_away_logo,'Brasil','espn',v_away_provider_id)
    on conflict(provider,provider_id) do update
      set name=excluded.name,short_name=excluded.short_name,crest_url=excluded.crest_url
    returning id into v_away_id;

    v_status_name:=lower(coalesce(v_event->'status'->'type'->>'name',''));
    v_status_state:=lower(coalesce(v_event->'status'->'type'->>'state','pre'));

    v_status:=case
      when v_status_name like '%postpon%' then 'POSTPONED'::public.match_status
      when v_status_name like '%cancel%' then 'CANCELLED'::public.match_status
      when v_status_state='in' then 'LIVE'::public.match_status
      when v_status_state='post' then 'FINISHED'::public.match_status
      else 'SCHEDULED'::public.match_status
    end;

    v_home_score:=case when coalesce(v_home->>'score','')~'^[0-9]+$' then (v_home->>'score')::integer else null end;
    v_away_score:=case when coalesce(v_away->>'score','')~'^[0-9]+$' then (v_away->>'score')::integer else null end;

    insert into public.matches as existing(
      competition_id,home_team_id,away_team_id,starts_at,status,
      home_score,away_score,venue,provider,provider_id,metadata,
      provider_updated_at,final_score_first_seen_at,result_confirmation_count,
      result_confirmed_at,result_disputed,result_locked,result_revision
    )
    values(
      v_competition_id,v_home_id,v_away_id,(v_event->>'date')::timestamptz,v_status,
      v_home_score,v_away_score,v_comp->'venue'->>'fullName','espn',v_event->>'id',
      jsonb_build_object(
        'league',p_league,
        'event_name',v_event->>'name',
        'short_name',v_event->>'shortName',
        'status_detail',v_event->'status'->'type'->>'detail',
        'status_short',v_event->'status'->'type'->>'shortDetail'
      ),
      now(),
      case when v_status='FINISHED' then now() else null end,
      case when v_status='FINISHED' then 1 else 0 end,
      null,false,false,0
    )
    on conflict(provider,provider_id) do update
      set competition_id=excluded.competition_id,
          home_team_id=excluded.home_team_id,
          away_team_id=excluded.away_team_id,
          starts_at=excluded.starts_at,
          venue=excluded.venue,
          metadata=excluded.metadata,
          provider_updated_at=now(),

          result_disputed=case
            when existing.result_locked then existing.result_disputed
            when existing.result_disputed then true
            when existing.result_confirmed_at is not null
              and (
                excluded.status<>'FINISHED'
                or existing.home_score is distinct from excluded.home_score
                or existing.away_score is distinct from excluded.away_score
              )
            then true
            else false
          end,

          status=case
            when existing.result_locked then existing.status
            when existing.result_confirmed_at is not null
              and (
                excluded.status<>'FINISHED'
                or existing.home_score is distinct from excluded.home_score
                or existing.away_score is distinct from excluded.away_score
              )
            then existing.status
            else excluded.status
          end,

          home_score=case
            when existing.result_locked then existing.home_score
            when existing.result_confirmed_at is not null
              and (
                excluded.status<>'FINISHED'
                or existing.home_score is distinct from excluded.home_score
                or existing.away_score is distinct from excluded.away_score
              )
            then existing.home_score
            else excluded.home_score
          end,

          away_score=case
            when existing.result_locked then existing.away_score
            when existing.result_confirmed_at is not null
              and (
                excluded.status<>'FINISHED'
                or existing.home_score is distinct from excluded.home_score
                or existing.away_score is distinct from excluded.away_score
              )
            then existing.away_score
            else excluded.away_score
          end,

          final_score_first_seen_at=case
            when existing.result_locked then existing.final_score_first_seen_at
            when existing.result_confirmed_at is not null then existing.final_score_first_seen_at
            when excluded.status<>'FINISHED' then null
            when existing.status<>'FINISHED'
              or existing.home_score is distinct from excluded.home_score
              or existing.away_score is distinct from excluded.away_score
            then now()
            else coalesce(existing.final_score_first_seen_at,now())
          end,

          result_confirmation_count=case
            when existing.result_locked then existing.result_confirmation_count
            when existing.result_confirmed_at is not null then existing.result_confirmation_count
            when excluded.status<>'FINISHED' then 0
            when existing.status='FINISHED'
              and existing.home_score is not distinct from excluded.home_score
              and existing.away_score is not distinct from excluded.away_score
            then existing.result_confirmation_count+1
            else 1
          end,

          result_confirmed_at=case
            when existing.result_locked then existing.result_confirmed_at
            when existing.result_confirmed_at is not null then existing.result_confirmed_at
            when excluded.status='FINISHED'
              and existing.status='FINISHED'
              and existing.home_score is not distinct from excluded.home_score
              and existing.away_score is not distinct from excluded.away_score
              and coalesce(existing.final_score_first_seen_at,now())<=now()-interval '10 minutes'
              and existing.result_confirmation_count>=2
            then now()
            else null
          end,

          result_revision=case
            when existing.result_locked then existing.result_revision
            when existing.result_confirmed_at is null
              and excluded.status='FINISHED'
              and existing.status='FINISHED'
              and existing.home_score is not distinct from excluded.home_score
              and existing.away_score is not distinct from excluded.away_score
              and coalesce(existing.final_score_first_seen_at,now())<=now()-interval '10 minutes'
              and existing.result_confirmation_count>=2
            then greatest(existing.result_revision,0)+1
            else existing.result_revision
          end,

          updated_at=now()
    returning id,result_disputed into v_match_id,v_disputed;

    if v_status in ('LIVE','FINISHED') then
      insert into private.match_result_observations(
        match_id,provider,provider_match_id,status,home_score,away_score
      )
      values(v_match_id,'espn',v_event->>'id',v_status,v_home_score,v_away_score);
    end if;

    if v_disputed then
      v_alert_rows:=0;
      insert into private.system_alerts(alert_key)
      values('result_dispute:'||v_match_id::text)
      on conflict(alert_key) do nothing;

      get diagnostics v_alert_rows = row_count;
      if v_alert_rows>0 then
        insert into public.notifications(user_id,type,title,body,payload)
        select
          p.id,
          'system_alert',
          'Resultado em revisão',
          'Uma partida apresentou divergência após confirmação. Revise no painel administrativo.',
          jsonb_build_object('match_id',v_match_id)
        from public.profiles p
        where p.role in ('ADMIN','SUPER_ADMIN');
      end if;
    end if;

    v_count:=v_count+1;
  end loop;

  return v_count;
end
$function$


CREATE OR REPLACE FUNCTION private.process_espn_responses()
 RETURNS TABLE(processed integer, imported integer, failed integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_catalog'
AS $function$
declare
  r record;
  v_payload jsonb;
  v_imported integer;
  v_processed integer := 0;
  v_total integer := 0;
  v_failed integer := 0;
begin
  for r in
    select q.request_id,q.league,h.status_code,h.content,h.error_msg
    from private.sports_sync_requests q
    join net._http_response h on h.id=q.request_id
    where q.processed_at is null
    order by q.requested_at
  loop
    begin
      if r.error_msg is not null or coalesce(r.status_code,0) < 200 or r.status_code >= 300 then
        update private.sports_sync_requests
        set processed_at=now(), error=coalesce(r.error_msg,'HTTP '||coalesce(r.status_code::text,'?'))
        where request_id=r.request_id;
        v_failed := v_failed + 1;
      else
        v_payload := r.content::jsonb;
        v_imported := private.ingest_espn_payload(r.league,v_payload);
        update private.sports_sync_requests
        set processed_at=now(), error=null
        where request_id=r.request_id;
        v_total := v_total + coalesce(v_imported,0);
      end if;
      v_processed := v_processed + 1;
    exception when others then
      update private.sports_sync_requests
      set processed_at=now(), error=sqlerrm
      where request_id=r.request_id;
      v_processed := v_processed + 1;
      v_failed := v_failed + 1;
    end;
  end loop;

  return query select v_processed,v_total,v_failed;
end
$function$


CREATE OR REPLACE FUNCTION private.process_finished_predictions()
 RETURNS TABLE(processed integer, correct integer, exact integer, xp_awarded integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  r record;
  v_actual_pick public.prediction_pick;
  v_correct boolean;
  v_exact boolean;
  v_new_xp integer;
  v_old_xp integer;
  v_delta integer;
  v_processed integer:=0;
  v_correct_count integer:=0;
  v_exact_count integer:=0;
  v_total_xp integer:=0;
  v_tx_id uuid;
begin
  for r in
    select
      p.id as prediction_id,
      p.user_id,
      p.pick,
      p.home_score as predicted_home,
      p.away_score as predicted_away,
      m.home_score,
      m.away_score,
      m.result_revision,
      pr.id as result_id,
      coalesce(pr.xp_awarded,0) as old_xp,
      coalesce(pr.settlement_revision,0) as old_revision
    from public.predictions p
    join public.matches m on m.id=p.match_id
    left join public.prediction_results pr on pr.prediction_id=p.id
    where m.status='FINISHED'
      and m.result_confirmed_at is not null
      and m.result_disputed=false
      and m.home_score is not null
      and m.away_score is not null
      and (pr.id is null or pr.settlement_revision<>m.result_revision)
    order by m.starts_at
    limit 1000
  loop
    v_actual_pick:=case
      when r.home_score>r.away_score then 'HOME'::public.prediction_pick
      when r.home_score<r.away_score then 'AWAY'::public.prediction_pick
      else 'DRAW'::public.prediction_pick
    end;

    v_correct:=r.pick=v_actual_pick;
    v_exact:=r.predicted_home is not null
      and r.predicted_away is not null
      and r.predicted_home=r.home_score
      and r.predicted_away=r.away_score;

    v_new_xp:=(case when v_correct then 20 else 0 end)
      +(case when v_exact then 100 else 0 end);
    v_old_xp:=coalesce(r.old_xp,0);
    v_delta:=v_new_xp-v_old_xp;

    insert into public.prediction_results(
      prediction_id,result_correct,exact_score,xp_awarded,processed_at,
      settlement_revision,settled_home_score,settled_away_score,updated_at
    )
    values(
      r.prediction_id,v_correct,v_exact,v_new_xp,now(),
      r.result_revision,r.home_score,r.away_score,now()
    )
    on conflict(prediction_id) do update
      set result_correct=excluded.result_correct,
          exact_score=excluded.exact_score,
          xp_awarded=excluded.xp_awarded,
          processed_at=now(),
          settlement_revision=excluded.settlement_revision,
          settled_home_score=excluded.settled_home_score,
          settled_away_score=excluded.settled_away_score,
          updated_at=now();

    if v_delta<>0 then
      v_tx_id:=null;
      insert into public.xp_transactions(
        user_id,amount,reason,metadata,idempotency_key
      )
      values(
        r.user_id,
        v_delta,
        'prediction_settlement',
        jsonb_build_object(
          'prediction_id',r.prediction_id,
          'revision',r.result_revision,
          'home_score',r.home_score,
          'away_score',r.away_score
        ),
        r.user_id::text||':prediction-settlement:'||r.prediction_id::text||':'||r.result_revision::text
      )
      on conflict(idempotency_key) do nothing
      returning id into v_tx_id;

      if v_tx_id is not null then
        update public.profiles
        set xp=xp+v_delta,updated_at=now()
        where id=r.user_id;
        v_total_xp:=v_total_xp+v_delta;
      end if;
    end if;

    v_processed:=v_processed+1;
    if v_correct then v_correct_count:=v_correct_count+1; end if;
    if v_exact then v_exact_count:=v_exact_count+1; end if;

    perform private.refresh_user_achievements(r.user_id);
  end loop;

  return query select v_processed,v_correct_count,v_exact_count,v_total_xp;
end
$function$


CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_referrer uuid;
begin
  insert into public.profiles(id,name,username,birth_date,city,state)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'name',''),
    nullif(lower(new.raw_user_meta_data->>'username'),''),
    nullif(new.raw_user_meta_data->>'birth_date','')::date,
    new.raw_user_meta_data->>'city',
    upper(new.raw_user_meta_data->>'state')
  );

  if nullif(lower(new.raw_user_meta_data->>'referrer'),'') is not null then
    select id into v_referrer
    from public.profiles
    where username=lower(new.raw_user_meta_data->>'referrer')::citext
      and id<>new.id
    limit 1;

    if v_referrer is not null then
      insert into public.referrals(referrer_id,referred_id,status,reward_xp)
      values(v_referrer,new.id,'pending',100)
      on conflict(referred_id) do nothing;
    end if;
  end if;

  return new;
end
$function$


CREATE OR REPLACE FUNCTION public.submit_prediction(p_match_id uuid, p_pick prediction_pick, p_home_score integer DEFAULT NULL::integer, p_away_score integer DEFAULT NULL::integer)
 RETURNS predictions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  uid uuid:=auth.uid();
  m public.matches;
  p public.predictions;
  today date:=(now() at time zone 'America/Sao_Paulo')::date;
  xp_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  perform private.check_prediction_rate_limit(uid);

  select * into m from public.matches where id=p_match_id for share;
  if not found then raise exception 'match_not_found'; end if;
  if m.status<>'SCHEDULED' or m.starts_at<=now() then raise exception 'predictions_closed'; end if;

  insert into public.predictions(user_id,match_id,pick,home_score,away_score)
  values(uid,p_match_id,p_pick,p_home_score,p_away_score)
  on conflict(user_id,match_id) do update
    set pick=excluded.pick,
        home_score=excluded.home_score,
        away_score=excluded.away_score,
        updated_at=now()
  returning * into p;

  insert into public.xp_transactions(user_id,amount,reason,metadata,idempotency_key)
  values(
    uid,5,'prediction_created',
    jsonb_build_object('match_id',p_match_id),
    uid::text||':prediction:'||p_match_id::text
  )
  on conflict(idempotency_key) do nothing
  returning id into xp_id;

  update public.profiles
  set xp=xp+case when xp_id is not null then 5 else 0 end,
      current_streak=case
        when last_activity_date=today then current_streak
        when last_activity_date=today-1 then current_streak+1
        else 1
      end,
      best_streak=greatest(
        best_streak,
        case
          when last_activity_date=today then current_streak
          when last_activity_date=today-1 then current_streak+1
          else 1
        end
      ),
      last_activity_date=today,
      updated_at=now()
  where id=uid;

  perform private.complete_referral_if_eligible(uid);
  perform private.refresh_active_challenges(uid);
  perform private.refresh_user_achievements(uid);

  return p;
end
$function$


CREATE OR REPLACE FUNCTION public.username_available(p_username text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  normalized text:=lower(trim(coalesce(p_username,'')));
begin
  if length(normalized)<3
    or length(normalized)>30
    or normalized!~'^[a-z0-9_.-]+$'
  then
    return false;
  end if;

  return not exists(
    select 1
    from public.profiles
    where username=normalized::citext
  );
end
$function$


CREATE OR REPLACE FUNCTION public.get_leaderboard(p_scope text DEFAULT 'global'::text, p_period text DEFAULT 'all'::text, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(rank_position bigint, user_id uuid, username text, city text, state character varying, xp bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_from timestamptz;
begin
  v_from := case p_period
    when 'weekly' then date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    when 'monthly' then date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    when 'season' then date_trunc('year',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    else null
  end;

  return query
  with scores as (
    select
      p.id,
      p.username::text as username,
      p.city,
      p.state,
      case
        when v_from is null then p.xp
        else coalesce(sum(x.amount) filter(where x.created_at>=v_from),0)::bigint
      end as score
    from public.profiles p
    left join public.xp_transactions x on x.user_id=p.id
    where
      case
        when p_scope='state' then upper(coalesce(p.state,''))=upper(coalesce(p_state,''))
        when p_scope='city' then upper(coalesce(p.state,''))=upper(coalesce(p_state,''))
          and lower(coalesce(p.city,''))=lower(coalesce(p_city,''))
        else true
      end
    group by p.id,p.username,p.city,p.state,p.xp
  ),
  ranked as (
    select
      row_number() over(order by score desc,id) as rank_position,
      id,username,city,state,score
    from scores
    where score>0 or v_from is null
  )
  select ranked.rank_position,ranked.id,ranked.username,ranked.city,ranked.state,ranked.score
  from ranked
  order by ranked.rank_position
  limit least(greatest(p_limit,1),200);
end
$function$


CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
 RETURNS TABLE(users bigint, matches bigint, predictions bigint, premium bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); r public.app_role;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select role into r from public.profiles where id=uid;
  if r not in ('ADMIN','SUPER_ADMIN') then raise exception 'forbidden'; end if;
  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.matches),
    (select count(*) from public.predictions),
    (select count(*) from public.profiles where plan_code<>'FREE');
end $function$


CREATE OR REPLACE FUNCTION public.admin_list_users(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, username text, name text, role app_role, plan_code plan_code, xp bigint, city text, state character varying, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
begin
  if private.current_admin_role() not in ('ADMIN','SUPER_ADMIN') then
    raise exception 'forbidden';
  end if;

  return query
  select
    p.id,
    p.username::text,
    p.name,
    p.role,
    p.plan_code,
    p.xp,
    p.city,
    p.state,
    p.created_at
  from public.profiles p
  where p_search is null
     or p_search=''
     or p.username::text ilike '%'||p_search||'%'
     or p.name ilike '%'||p_search||'%'
     or p.city ilike '%'||p_search||'%'
  order by p.created_at desc
  limit least(greatest(p_limit,1),200)
  offset greatest(p_offset,0);
end
$function$


CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role app_role)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  before_row jsonb;
  result_row public.profiles;
begin
  select role into actor_role from public.profiles where id=actor;

  if actor_role <> 'SUPER_ADMIN' then
    raise exception 'forbidden';
  end if;

  if p_user_id=actor and p_role<>'SUPER_ADMIN' then
    raise exception 'cannot_demote_self';
  end if;

  select to_jsonb(p.*) into before_row from public.profiles p where p.id=p_user_id;
  if before_row is null then raise exception 'user_not_found'; end if;

  update public.profiles
  set role=p_role,updated_at=now()
  where id=p_user_id
  returning * into result_row;

  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(actor,'user_role_changed','profile',p_user_id::text,before_row,to_jsonb(result_row));

  return result_row;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_set_user_plan(p_user_id uuid, p_plan plan_code)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  before_row jsonb;
  result_row public.profiles;
begin
  select role into actor_role from public.profiles where id=actor;
  if actor_role not in ('ADMIN','SUPER_ADMIN') then raise exception 'forbidden'; end if;

  select to_jsonb(p.*) into before_row from public.profiles p where p.id=p_user_id;
  if before_row is null then raise exception 'user_not_found'; end if;

  update public.profiles
  set plan_code=p_plan,updated_at=now()
  where id=p_user_id
  returning * into result_row;

  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(actor,'user_plan_changed','profile',p_user_id::text,before_row,to_jsonb(result_row));

  return result_row;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_update_match(p_match_id uuid, p_status match_status DEFAULT NULL::match_status, p_home_score integer DEFAULT NULL::integer, p_away_score integer DEFAULT NULL::integer, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  before_row jsonb;
  result_row public.matches;
begin
  select role into actor_role from public.profiles where id=actor;
  if actor_role not in ('ADMIN','SUPER_ADMIN') then raise exception 'forbidden'; end if;

  select to_jsonb(m.*) into before_row from public.matches m where m.id=p_match_id;
  if before_row is null then raise exception 'match_not_found'; end if;

  update public.matches
  set
    status=coalesce(p_status,status),
    home_score=case when p_home_score is null then home_score else p_home_score end,
    away_score=case when p_away_score is null then away_score else p_away_score end,
    starts_at=coalesce(p_starts_at,starts_at),
    updated_at=now()
  where id=p_match_id
  returning * into result_row;

  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(actor,'match_updated','match',p_match_id::text,before_row,to_jsonb(result_row));

  return result_row;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_create_notification(p_title text, p_body text, p_type text DEFAULT 'admin'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  inserted_count integer;
begin
  select role into actor_role from public.profiles where id=actor;
  if actor_role not in ('ADMIN','SUPER_ADMIN') then raise exception 'forbidden'; end if;

  if length(trim(p_title))<2 or length(trim(p_body))<2 then
    raise exception 'invalid_notification';
  end if;

  if p_user_id is not null then
    insert into public.notifications(user_id,type,title,body)
    values(p_user_id,p_type,p_title,p_body);
    inserted_count := 1;
  else
    insert into public.notifications(user_id,type,title,body)
    select id,p_type,p_title,p_body from public.profiles;
    get diagnostics inserted_count = row_count;
  end if;

  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(actor,'notification_created','notification',coalesce(p_user_id::text,'broadcast'),
    jsonb_build_object('title',p_title,'type',p_type,'recipients',inserted_count));

  return inserted_count;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_recent_audit(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, action text, entity_type text, entity_id text, actor_username text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
begin
  if private.current_admin_role() not in ('ADMIN','SUPER_ADMIN') then
    raise exception 'forbidden';
  end if;

  return query
  select
    l.id,l.action,l.entity_type,l.entity_id,p.username::text,l.created_at
  from public.admin_audit_logs l
  left join public.profiles p on p.id=l.actor_id
  order by l.created_at desc
  limit least(greatest(p_limit,1),200);
end
$function$


CREATE OR REPLACE FUNCTION public.admin_create_challenge(p_name text, p_type text, p_description text, p_xp_reward integer, p_predictions integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS challenges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  result_row public.challenges;
begin
  select role into actor_role from public.profiles where id=actor;
  if actor_role not in ('ADMIN','SUPER_ADMIN') then raise exception 'forbidden'; end if;
  if length(trim(p_name))<2 or p_xp_reward<0 or p_predictions<1 then raise exception 'invalid_challenge'; end if;
  if p_ends_at<=p_starts_at then raise exception 'invalid_period'; end if;

  insert into public.challenges(name,type,description,xp_reward,criteria,starts_at,ends_at,active)
  values(trim(p_name),p_type,trim(p_description),p_xp_reward,jsonb_build_object('predictions',p_predictions),p_starts_at,p_ends_at,true)
  returning * into result_row;

  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(actor,'challenge_created','challenge',result_row.id::text,to_jsonb(result_row));

  return result_row;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_create_achievement(p_code text, p_name text, p_description text, p_xp_reward integer)
 RETURNS achievements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  result_row public.achievements;
begin
  select role into actor_role from public.profiles where id=actor;
  if actor_role not in ('ADMIN','SUPER_ADMIN') then raise exception 'forbidden'; end if;
  if length(trim(p_code))<2 or length(trim(p_name))<2 or p_xp_reward<0 then raise exception 'invalid_achievement'; end if;

  insert into public.achievements(code,name,description,xp_reward,criteria,active)
  values(upper(trim(p_code)),trim(p_name),trim(p_description),p_xp_reward,'{}'::jsonb,true)
  returning * into result_row;

  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(actor,'achievement_created','achievement',result_row.id::text,to_jsonb(result_row));

  return result_row;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_system_health()
 RETURNS TABLE(last_provider_request timestamp with time zone, last_provider_processed timestamp with time zone, provider_failures_last_hour bigint, provider_pending bigint, live_matches bigint, scheduled_matches bigint, finished_unconfirmed bigint, disputed_results bigint, pending_prediction_settlements bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
begin
  if private.current_admin_role() not in ('ADMIN','SUPER_ADMIN') then
    raise exception 'forbidden';
  end if;

  return query select
    (select max(requested_at) from private.sports_sync_requests),
    (select max(processed_at) from private.sports_sync_requests where error is null),
    (select count(*) from private.sports_sync_requests where requested_at>=now()-interval '1 hour' and error is not null),
    (select count(*) from private.sports_sync_requests where processed_at is null),
    (select count(*) from public.matches where status='LIVE'),
    (select count(*) from public.matches where status='SCHEDULED'),
    (select count(*) from public.matches where status='FINISHED' and result_confirmed_at is null and result_disputed=false),
    (select count(*) from public.matches where result_disputed=true),
    (
      select count(*)
      from public.predictions p
      join public.matches m on m.id=p.match_id
      left join public.prediction_results pr on pr.prediction_id=p.id
      where m.status='FINISHED'
        and m.result_confirmed_at is not null
        and m.result_disputed=false
        and pr.id is null
    );
end
$function$


CREATE OR REPLACE FUNCTION public.admin_result_reviews()
 RETURNS TABLE(match_id uuid, competition text, home_team text, away_team text, canonical_home_score integer, canonical_away_score integer, result_confirmed_at timestamp with time zone, result_disputed boolean, result_locked boolean, result_revision integer, latest_provider_status match_status, latest_provider_home_score integer, latest_provider_away_score integer, latest_observed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
begin
  if private.current_admin_role() not in ('ADMIN','SUPER_ADMIN') then
    raise exception 'forbidden';
  end if;

  return query
  select
    m.id,
    c.name,
    h.name,
    a.name,
    m.home_score,
    m.away_score,
    m.result_confirmed_at,
    m.result_disputed,
    m.result_locked,
    m.result_revision,
    o.status,
    o.home_score,
    o.away_score,
    o.observed_at
  from public.matches m
  join public.competitions c on c.id=m.competition_id
  join public.teams h on h.id=m.home_team_id
  join public.teams a on a.id=m.away_team_id
  left join lateral(
    select x.status,x.home_score,x.away_score,x.observed_at
    from private.match_result_observations x
    where x.match_id=m.id
    order by x.observed_at desc
    limit 1
  ) o on true
  where m.result_disputed=true
     or (m.status='FINISHED' and m.result_confirmed_at is null)
  order by m.starts_at desc;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_resolve_match_result(p_match_id uuid, p_home_score integer, p_away_score integer)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  actor uuid:=auth.uid();
  actor_role public.app_role;
  before_row jsonb;
  result_row public.matches;
begin
  select role into actor_role from public.profiles where id=actor;
  if actor_role<>'SUPER_ADMIN' then raise exception 'forbidden'; end if;
  if p_home_score<0 or p_away_score<0 then raise exception 'invalid_score'; end if;

  select to_jsonb(m.*) into before_row
  from public.matches m
  where m.id=p_match_id
  for update;

  if before_row is null then raise exception 'match_not_found'; end if;

  update public.matches
  set
    status='FINISHED',
    home_score=p_home_score,
    away_score=p_away_score,
    result_disputed=false,
    result_locked=true,
    final_score_first_seen_at=coalesce(final_score_first_seen_at,now()),
    result_confirmation_count=999,
    result_confirmed_at=now(),
    result_revision=greatest(result_revision,0)+1,
    metadata=metadata||jsonb_build_object(
      'manual_result_override',true,
      'manual_result_override_at',now(),
      'manual_result_override_by',actor
    ),
    updated_at=now()
  where id=p_match_id
  returning * into result_row;

  update private.system_alerts
  set resolved_at=now()
  where alert_key='result_dispute:'||p_match_id::text
    and resolved_at is null;

  insert into public.admin_audit_logs(
    actor_id,action,entity_type,entity_id,before_data,after_data
  )
  values(
    actor,'match_result_resolved','match',p_match_id::text,before_row,to_jsonb(result_row)
  );

  return result_row;
end
$function$



-- Lock down private helpers.
revoke all on all functions in schema private from public,anon,authenticated;

-- Public application RPC grants.
revoke all on function public.handle_new_user() from public,anon,authenticated;

revoke all on function public.submit_prediction(uuid,public.prediction_pick,integer,integer) from public,anon;
grant execute on function public.submit_prediction(uuid,public.prediction_pick,integer,integer) to authenticated;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon,authenticated;

revoke all on function public.get_leaderboard(text,text,text,text,integer) from public;
grant execute on function public.get_leaderboard(text,text,text,text,integer) to anon,authenticated;

revoke all on function public.admin_dashboard_stats() from public,anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

revoke all on function public.admin_list_users(text,integer,integer) from public,anon;
grant execute on function public.admin_list_users(text,integer,integer) to authenticated;

revoke all on function public.admin_set_user_role(uuid,public.app_role) from public,anon;
grant execute on function public.admin_set_user_role(uuid,public.app_role) to authenticated;

revoke all on function public.admin_set_user_plan(uuid,public.plan_code) from public,anon;
grant execute on function public.admin_set_user_plan(uuid,public.plan_code) to authenticated;

revoke all on function public.admin_update_match(uuid,public.match_status,integer,integer,timestamptz) from public,anon;
grant execute on function public.admin_update_match(uuid,public.match_status,integer,integer,timestamptz) to authenticated;

revoke all on function public.admin_create_notification(text,text,text,uuid) from public,anon;
grant execute on function public.admin_create_notification(text,text,text,uuid) to authenticated;

revoke all on function public.admin_recent_audit(integer) from public,anon;
grant execute on function public.admin_recent_audit(integer) to authenticated;

revoke all on function public.admin_create_challenge(text,text,text,integer,integer,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_create_challenge(text,text,text,integer,integer,timestamptz,timestamptz) to authenticated;

revoke all on function public.admin_create_achievement(text,text,text,integer) from public,anon;
grant execute on function public.admin_create_achievement(text,text,text,integer) to authenticated;

revoke all on function public.admin_system_health() from public,anon;
grant execute on function public.admin_system_health() to authenticated;

revoke all on function public.admin_result_reviews() from public,anon;
grant execute on function public.admin_result_reviews() to authenticated;

revoke all on function public.admin_resolve_match_result(uuid,integer,integer) from public,anon;
grant execute on function public.admin_resolve_match_result(uuid,integer,integer) to authenticated;

-- Keep trigger using the current referral-aware user bootstrap.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Recreate recurring cloud jobs by name (cron.schedule upserts same-name jobs).
select cron.schedule(
  'arena-real-soccer-live',
  '*/5 * * * *',
  'select private.request_espn_dates(1,0);'
);
select cron.schedule(
  'arena-real-soccer-fixtures',
  '15 */6 * * *',
  'select private.request_espn_dates(0,21);'
);
select cron.schedule(
  'arena-process-real-soccer',
  '* * * * *',
  'select * from private.process_espn_responses();'
);
select cron.schedule(
  'arena-process-prediction-results',
  '*/2 * * * *',
  'select * from private.process_finished_predictions();'
);
select cron.schedule(
  'arena-recurring-challenges',
  '5 3 * * *',
  'select private.ensure_recurring_challenges();'
);
select cron.schedule(
  'arena-clean-result-observations',
  '20 4 * * *',
  $$delete from private.match_result_observations where observed_at<now()-interval '30 days';$$
);

select private.ensure_recurring_challenges();
