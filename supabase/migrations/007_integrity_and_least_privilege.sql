-- Production integrity + least-privilege hardening.

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;

revoke all on table public.predictions from anon, authenticated;
grant select on table public.predictions to authenticated;
revoke all on table public.prediction_results from anon, authenticated;
grant select on table public.prediction_results to authenticated;
revoke all on table public.xp_transactions from anon, authenticated;
grant select on table public.xp_transactions to authenticated;
revoke all on table public.user_achievements from anon, authenticated;
grant select on table public.user_achievements to authenticated;
revoke all on table public.challenge_entries from anon, authenticated;
grant select on table public.challenge_entries to authenticated;
revoke all on table public.referrals from anon, authenticated;
grant select on table public.referrals to authenticated;
revoke all on table public.subscriptions from anon, authenticated;
grant select on table public.subscriptions to authenticated;

revoke all on table public.leaderboard_entries from anon, authenticated;
grant select on table public.leaderboard_entries to anon, authenticated;

revoke all on table public.competitions from anon, authenticated;
revoke all on table public.seasons from anon, authenticated;
revoke all on table public.rounds from anon, authenticated;
revoke all on table public.teams from anon, authenticated;
revoke all on table public.players from anon, authenticated;
revoke all on table public.matches from anon, authenticated;
revoke all on table public.match_events from anon, authenticated;
revoke all on table public.team_statistics from anon, authenticated;
revoke all on table public.player_statistics from anon, authenticated;
revoke all on table public.levels from anon, authenticated;
revoke all on table public.achievements from anon, authenticated;
revoke all on table public.challenges from anon, authenticated;
revoke all on table public.plans from anon, authenticated;

grant select on table public.competitions,public.seasons,public.rounds,public.teams,
  public.players,public.matches,public.match_events,public.team_statistics,
  public.player_statistics,public.levels,public.achievements,public.challenges,
  public.plans to anon, authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update(name,username,city,state,avatar_url,favorite_team_id,updated_at)
  on public.profiles to authenticated;

create or replace function public.admin_update_match(
  p_match_id uuid,
  p_status public.match_status default null,
  p_home_score integer default null,
  p_away_score integer default null,
  p_starts_at timestamptz default null
)
returns public.matches
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  actor uuid:=auth.uid();
  actor_role public.app_role;
  before_row public.matches;
  result_row public.matches;
  result_affecting_change boolean:=false;
begin
  select role into actor_role from public.profiles where id=actor;
  if actor_role not in ('ADMIN','SUPER_ADMIN') then raise exception 'forbidden'; end if;

  select * into before_row from public.matches where id=p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  if before_row.result_locked then raise exception 'result_locked'; end if;

  result_affecting_change :=
       (p_status is not null and p_status is distinct from before_row.status)
    or (p_home_score is not null and p_home_score is distinct from before_row.home_score)
    or (p_away_score is not null and p_away_score is distinct from before_row.away_score);

  if result_affecting_change
     and (p_status='FINISHED' or before_row.status='FINISHED' or before_row.result_confirmed_at is not null)
  then
    raise exception 'result_requires_review';
  end if;

  update public.matches
  set status=coalesce(p_status,status),
      home_score=case when p_home_score is null then home_score else p_home_score end,
      away_score=case when p_away_score is null then away_score else p_away_score end,
      starts_at=coalesce(p_starts_at,starts_at),
      updated_at=now()
  where id=p_match_id
  returning * into result_row;

  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(actor,'match_updated','match',p_match_id::text,to_jsonb(before_row),to_jsonb(result_row));

  return result_row;
end
$$;

revoke all on function public.admin_update_match(uuid,public.match_status,integer,integer,timestamptz) from public,anon;
grant execute on function public.admin_update_match(uuid,public.match_status,integer,integer,timestamptz) to authenticated;

create or replace function private.process_finished_predictions()
returns table(processed integer, correct integer, exact integer, xp_awarded integer)
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
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
    select p.id prediction_id,p.user_id,p.pick,
      p.home_score predicted_home,p.away_score predicted_away,
      m.id match_id,m.home_score,m.away_score,m.result_revision,
      h.name home_name,a.name away_name,
      pr.id result_id,coalesce(pr.xp_awarded,0) old_xp,
      coalesce(pr.settlement_revision,0) old_revision
    from public.predictions p
    join public.matches m on m.id=p.match_id
    join public.teams h on h.id=m.home_team_id
    join public.teams a on a.id=m.away_team_id
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
    v_exact:=r.predicted_home is not null and r.predicted_away is not null
      and r.predicted_home=r.home_score and r.predicted_away=r.away_score;
    v_new_xp:=(case when v_correct then 20 else 0 end)+(case when v_exact then 100 else 0 end);
    v_old_xp:=coalesce(r.old_xp,0);
    v_delta:=v_new_xp-v_old_xp;

    insert into public.prediction_results(
      prediction_id,result_correct,exact_score,xp_awarded,processed_at,
      settlement_revision,settled_home_score,settled_away_score,updated_at
    )
    values(r.prediction_id,v_correct,v_exact,v_new_xp,now(),r.result_revision,r.home_score,r.away_score,now())
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
      insert into public.xp_transactions(user_id,amount,reason,metadata,idempotency_key)
      values(
        r.user_id,v_delta,'prediction_settlement',
        jsonb_build_object('prediction_id',r.prediction_id,'match_id',r.match_id,
          'revision',r.result_revision,'home_score',r.home_score,'away_score',r.away_score),
        r.user_id::text||':prediction-settlement:'||r.prediction_id::text||':'||r.result_revision::text
      )
      on conflict(idempotency_key) do nothing
      returning id into v_tx_id;

      if v_tx_id is not null then
        update public.profiles set xp=greatest(0,xp+v_delta),updated_at=now() where id=r.user_id;

        insert into public.notifications(user_id,type,title,body,payload)
        values(
          r.user_id,'prediction_result',
          case when v_exact then 'Placar exato! 🎯'
               when v_correct then 'Palpite correto! ✅'
               when v_delta<0 then 'Resultado revisado'
               else 'Resultado confirmado' end,
          case when v_exact or v_correct
               then r.home_name||' '||r.home_score||' × '||r.away_score||' '||r.away_name||'. +'||v_new_xp||' XP.'
               when v_delta<0 then 'O resultado oficial foi revisado e seu XP foi reconciliado automaticamente.'
               else r.home_name||' '||r.home_score||' × '||r.away_score||' '||r.away_name||'.' end,
          jsonb_build_object('prediction_id',r.prediction_id,'match_id',r.match_id,
            'xp',v_new_xp,'delta',v_delta,'revision',r.result_revision)
        );

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
$$;

revoke all on function private.process_finished_predictions() from public,anon,authenticated;
