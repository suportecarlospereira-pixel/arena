-- Real sports sync: ESPN -> Supabase
-- Keeps ARENA fixtures real and automatically refreshed.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists private;

alter table public.competitions add column if not exists provider text;
alter table public.competitions add column if not exists provider_id text;
alter table public.teams add column if not exists provider text;
alter table public.teams add column if not exists provider_id text;
alter table public.matches add column if not exists provider text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='competitions_provider_unique') then
    alter table public.competitions add constraint competitions_provider_unique unique(provider,provider_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='teams_provider_unique') then
    alter table public.teams add constraint teams_provider_unique unique(provider,provider_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='matches_provider_unique') then
    alter table public.matches add constraint matches_provider_unique unique(provider,provider_id);
  end if;
end $$;

create table if not exists private.sports_sync_requests (
  request_id bigint primary key,
  league text not null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create or replace function private.ingest_espn_payload(p_league text, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  v_competition_id uuid;
  v_event jsonb;
  v_comp jsonb;
  v_home jsonb;
  v_away jsonb;
  v_home_id uuid;
  v_away_id uuid;
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
  v_count integer := 0;
  v_comp_name text;
  v_comp_slug text;
begin
  v_comp_name := case p_league
    when 'bra.1' then 'Brasileirão Série A'
    when 'bra.2' then 'Brasileirão Série B'
    when 'bra.copa_do_brazil' then 'Copa do Brasil'
    when 'conmebol.libertadores' then 'CONMEBOL Libertadores'
    when 'conmebol.sudamericana' then 'CONMEBOL Sul-Americana'
    else p_league
  end;

  v_comp_slug := case p_league
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
    v_comp := v_event->'competitions'->0;

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

    v_home_provider_id := v_home->'team'->>'id';
    v_away_provider_id := v_away->'team'->>'id';
    v_home_name := coalesce(v_home->'team'->>'displayName',v_home->'team'->>'name','Time mandante');
    v_away_name := coalesce(v_away->'team'->>'displayName',v_away->'team'->>'name','Time visitante');
    v_home_abbr := coalesce(v_home->'team'->>'abbreviation',left(v_home_name,3));
    v_away_abbr := coalesce(v_away->'team'->>'abbreviation',left(v_away_name,3));
    v_home_logo := coalesce(v_home->'team'->>'logo',v_home->'team'->'logos'->0->>'href');
    v_away_logo := coalesce(v_away->'team'->>'logo',v_away->'team'->'logos'->0->>'href');

    insert into public.teams(name,short_name,slug,crest_url,country,provider,provider_id)
    values(v_home_name,v_home_abbr,'espn-'||v_home_provider_id,v_home_logo,'Brasil','espn',v_home_provider_id)
    on conflict(provider,provider_id) do update
      set name=excluded.name, short_name=excluded.short_name, crest_url=excluded.crest_url
    returning id into v_home_id;

    insert into public.teams(name,short_name,slug,crest_url,country,provider,provider_id)
    values(v_away_name,v_away_abbr,'espn-'||v_away_provider_id,v_away_logo,'Brasil','espn',v_away_provider_id)
    on conflict(provider,provider_id) do update
      set name=excluded.name, short_name=excluded.short_name, crest_url=excluded.crest_url
    returning id into v_away_id;

    v_status_name := lower(coalesce(v_event->'status'->'type'->>'name',''));
    v_status_state := lower(coalesce(v_event->'status'->'type'->>'state','pre'));

    v_status := case
      when v_status_name like '%postpon%' then 'POSTPONED'::public.match_status
      when v_status_name like '%cancel%' then 'CANCELLED'::public.match_status
      when v_status_state='in' then 'LIVE'::public.match_status
      when v_status_state='post' then 'FINISHED'::public.match_status
      else 'SCHEDULED'::public.match_status
    end;

    v_home_score := case when coalesce(v_home->>'score','') ~ '^[0-9]+$' then (v_home->>'score')::integer else null end;
    v_away_score := case when coalesce(v_away->>'score','') ~ '^[0-9]+$' then (v_away->>'score')::integer else null end;

    insert into public.matches(
      competition_id,home_team_id,away_team_id,starts_at,status,
      home_score,away_score,venue,provider,provider_id,metadata
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
      )
    )
    on conflict(provider,provider_id) do update
      set competition_id=excluded.competition_id,
          home_team_id=excluded.home_team_id,
          away_team_id=excluded.away_team_id,
          starts_at=excluded.starts_at,
          status=excluded.status,
          home_score=excluded.home_score,
          away_score=excluded.away_score,
          venue=excluded.venue,
          metadata=excluded.metadata,
          updated_at=now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end
$$;

create or replace function private.request_espn_offset_range(p_start_offset integer, p_end_offset integer)
returns integer
language plpgsql
security definer
set search_path=private,public,pg_catalog
as $$
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
$$;

create or replace function private.request_espn_dates(p_days_back integer, p_days_forward integer)
returns integer
language sql
security definer
set search_path=private,public,pg_catalog
as $$
  select private.request_espn_offset_range(-p_days_back,p_days_forward);
$$;

create or replace function private.process_espn_responses()
returns table(processed integer, imported integer, failed integer)
language plpgsql
security definer
set search_path=private,public,pg_catalog
as $$
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

  delete from private.sports_sync_requests
  where requested_at < now() - interval '2 days';

  return query select v_processed,v_total,v_failed;
end
$$;

revoke all on function private.ingest_espn_payload(text,jsonb) from public,anon,authenticated;
revoke all on function private.request_espn_offset_range(integer,integer) from public,anon,authenticated;
revoke all on function private.request_espn_dates(integer,integer) from public,anon,authenticated;
revoke all on function private.process_espn_responses() from public,anon,authenticated;

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
