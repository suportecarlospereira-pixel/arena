-- Prevent future-period fixtures from leaking into current league rankings.

create or replace function public.get_league_leaderboard(
  p_league_id uuid,
  p_period text default 'all',
  p_limit integer default 100
)
returns table(
  rank_position bigint,
  user_id uuid,
  username text,
  name text,
  xp bigint,
  predictions bigint,
  hits bigint
)
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  v_from timestamptz;
  v_to timestamptz;
  v_private boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select is_private into v_private
  from public.leagues
  where id=p_league_id;

  if v_private is null then raise exception 'league_not_found'; end if;

  if v_private and not exists(
    select 1 from public.league_members
    where league_id=p_league_id and user_id=uid
  ) then
    raise exception 'forbidden';
  end if;

  v_from:=case p_period
    when 'weekly' then date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    when 'monthly' then date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    when 'season' then date_trunc('year',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    else null
  end;

  v_to:=case p_period
    when 'weekly' then v_from+interval '7 days'
    when 'monthly' then v_from+interval '1 month'
    when 'season' then v_from+interval '1 year'
    else null
  end;

  return query
  with stats as (
    select
      lm.user_id,
      p.username::text username,
      p.name,
      count(pr.id) filter(
        where v_from is null
           or (m.starts_at>=v_from and m.starts_at<v_to)
      )::bigint predictions,
      count(rr.id) filter(
        where rr.result_correct
          and (
            v_from is null
            or (m.starts_at>=v_from and m.starts_at<v_to)
          )
      )::bigint hits,
      (
        5*count(pr.id) filter(
          where v_from is null
             or (m.starts_at>=v_from and m.starts_at<v_to)
        )
        +coalesce(
          sum(rr.xp_awarded) filter(
            where v_from is null
               or (m.starts_at>=v_from and m.starts_at<v_to)
          ),
          0
        )
      )::bigint score
    from public.league_members lm
    join public.profiles p on p.id=lm.user_id
    left join public.predictions pr on pr.user_id=lm.user_id
    left join public.matches m on m.id=pr.match_id
    left join public.prediction_results rr on rr.prediction_id=pr.id
    where lm.league_id=p_league_id
    group by lm.user_id,p.username,p.name
  )
  select
    row_number() over(order by score desc,user_id),
    user_id,username,name,score,predictions,hits
  from stats
  order by score desc,user_id
  limit least(greatest(p_limit,1),200);
end
$$;

revoke all on function public.get_league_leaderboard(uuid,text,integer)
  from public,anon;
grant execute on function public.get_league_leaderboard(uuid,text,integer)
  to authenticated;
