-- ARENA streak shield hardening.
-- Keeps the current production submit_prediction flow reproducible from migrations.

create or replace function public.submit_prediction(
  p_match_id uuid,
  p_pick public.prediction_pick,
  p_home_score integer default null,
  p_away_score integer default null
)
returns public.predictions
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  m public.matches;
  p public.predictions;
  today date:=(now() at time zone 'America/Sao_Paulo')::date;
  xp_id uuid;
  v_last date;
  v_streak integer;
  v_freezes integer;
  v_used_freeze boolean:=false;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_prediction_rate_limit(uid);

  select *
  into m
  from public.matches
  where id=p_match_id
  for share;

  if not found then
    raise exception 'match_not_found';
  end if;

  if m.status<>'SCHEDULED' or m.starts_at<=now() then
    raise exception 'predictions_closed';
  end if;

  select last_activity_date,current_streak,streak_freezes
  into v_last,v_streak,v_freezes
  from public.profiles
  where id=uid
  for update;

  insert into public.predictions(
    user_id,match_id,pick,home_score,away_score
  )
  values(
    uid,p_match_id,p_pick,p_home_score,p_away_score
  )
  on conflict(user_id,match_id) do update
    set pick=excluded.pick,
        home_score=excluded.home_score,
        away_score=excluded.away_score,
        updated_at=now()
  returning * into p;

  insert into public.xp_transactions(
    user_id,amount,reason,metadata,idempotency_key
  )
  values(
    uid,
    5,
    'prediction_created',
    jsonb_build_object('match_id',p_match_id),
    uid::text||':prediction:'||p_match_id::text
  )
  on conflict(idempotency_key) do nothing
  returning id into xp_id;

  v_used_freeze:=v_last=today-2 and v_freezes>0;

  update public.profiles
  set
    xp=xp+case when xp_id is not null then 5 else 0 end,
    current_streak=case
      when v_last=today then v_streak
      when v_last=today-1 then v_streak+1
      when v_used_freeze then v_streak+1
      else 1
    end,
    best_streak=greatest(
      best_streak,
      case
        when v_last=today then v_streak
        when v_last=today-1 then v_streak+1
        when v_used_freeze then v_streak+1
        else 1
      end
    ),
    streak_freezes=case
      when v_used_freeze then greatest(0,v_freezes-1)
      else v_freezes
    end,
    last_activity_date=today,
    updated_at=now()
  where id=uid;

  if v_used_freeze then
    insert into public.notifications(
      user_id,type,title,body,payload
    )
    values(
      uid,
      'streak',
      'Escudo de sequência usado 🛡️',
      'Você perdeu um dia, mas seu escudo protegeu sua sequência.',
      jsonb_build_object('remaining',greatest(0,v_freezes-1))
    );
  end if;

  perform private.complete_referral_if_eligible(uid);
  perform private.refresh_active_challenges(uid);
  perform private.refresh_user_achievements(uid);

  return p;
end
$$;

revoke all on function public.submit_prediction(
  uuid,public.prediction_pick,integer,integer
) from public,anon;

grant execute on function public.submit_prediction(
  uuid,public.prediction_pick,integer,integer
) to authenticated;
