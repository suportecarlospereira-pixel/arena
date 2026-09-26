-- Referral premium milestones with anti-abuse qualification.
-- Existing referral XP remains unchanged.
-- Premium qualification requires at least 3 predictions across 2 local days.

create or replace function private.referral_is_premium_qualified(
  p_referred_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_catalog
as $$
  select
    count(*)>=3
    and count(distinct (created_at at time zone 'America/Sao_Paulo')::date)>=2
  from public.predictions
  where user_id=p_referred_id;
$$;

revoke all on function private.referral_is_premium_qualified(uuid)
from public,anon,authenticated;

create or replace function private.refresh_referral_premium_rewards(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  v_qualified integer;
  v_awarded integer:=0;
  v_grant_id uuid;
begin
  if p_user_id is null then return 0; end if;

  select count(*)::integer
  into v_qualified
  from public.referrals r
  where r.referrer_id=p_user_id
    and r.status='completed'
    and private.referral_is_premium_qualified(r.referred_id);

  if v_qualified>=3 then
    insert into public.plan_grants(
      user_id,plan_code,source,source_id,starts_at,ends_at,metadata
    )
    values(
      p_user_id,
      'PRO',
      'referral_milestone',
      '3',
      now(),
      now()+interval '3 days',
      jsonb_build_object(
        'milestone',3,
        'qualified_referrals',v_qualified,
        'qualification','3_predictions_2_days'
      )
    )
    on conflict(user_id,source,source_id)
      where source_id is not null
    do nothing
    returning id into v_grant_id;

    if v_grant_id is not null then
      v_awarded:=v_awarded+1;

      insert into public.notifications(
        user_id,type,title,body,payload
      )
      values(
        p_user_id,
        'referral',
        '3 indicações qualificadas: PRO ✨',
        'Você ganhou 3 dias de ARENA PRO.',
        jsonb_build_object(
          'source','referral_milestone',
          'milestone',3,
          'plan','PRO',
          'days',3
        )
      );
    end if;
  end if;

  v_grant_id:=null;

  if v_qualified>=10 then
    insert into public.plan_grants(
      user_id,plan_code,source,source_id,starts_at,ends_at,metadata
    )
    values(
      p_user_id,
      'PRO_PLUS',
      'referral_milestone',
      '10',
      now(),
      now()+interval '7 days',
      jsonb_build_object(
        'milestone',10,
        'qualified_referrals',v_qualified,
        'qualification','3_predictions_2_days'
      )
    )
    on conflict(user_id,source,source_id)
      where source_id is not null
    do nothing
    returning id into v_grant_id;

    if v_grant_id is not null then
      v_awarded:=v_awarded+1;

      insert into public.notifications(
        user_id,type,title,body,payload
      )
      values(
        p_user_id,
        'referral',
        '10 indicações qualificadas: PRO+ 🚀',
        'Você ganhou 7 dias de ARENA PRO+.',
        jsonb_build_object(
          'source','referral_milestone',
          'milestone',10,
          'plan','PRO_PLUS',
          'days',7
        )
      );
    end if;
  end if;

  return v_awarded;
end
$$;

revoke all on function private.refresh_referral_premium_rewards(uuid)
from public,anon,authenticated;

create or replace function private.referral_premium_milestone_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
begin
  if old.status is distinct from new.status
     and new.status='completed'
  then
    perform private.refresh_referral_premium_rewards(new.referrer_id);
  end if;

  return new;
end
$$;

revoke all on function private.referral_premium_milestone_trigger()
from public,anon,authenticated;

drop trigger if exists referral_premium_milestone on public.referrals;
create trigger referral_premium_milestone
after update of status on public.referrals
for each row execute function private.referral_premium_milestone_trigger();

create or replace function private.referral_premium_recheck_on_prediction()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare v_referrer uuid;
begin
  select referrer_id
  into v_referrer
  from public.referrals
  where referred_id=new.user_id
    and status='completed'
  limit 1;

  if v_referrer is not null then
    perform private.refresh_referral_premium_rewards(v_referrer);
  end if;

  return new;
end
$$;

revoke all on function private.referral_premium_recheck_on_prediction()
from public,anon,authenticated;

drop trigger if exists referral_premium_prediction_recheck on public.predictions;
create trigger referral_premium_prediction_recheck
after insert on public.predictions
for each row execute function private.referral_premium_recheck_on_prediction();

drop function if exists public.get_my_referral_progress();

create function public.get_my_referral_progress()
returns table(
  completed_referrals bigint,
  qualified_referrals bigint,
  next_milestone integer,
  next_reward_plan public.plan_code,
  next_reward_days integer,
  remaining_to_next bigint,
  milestone_3_claimed boolean,
  milestone_10_claimed boolean
)
language plpgsql
stable
security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  v_completed bigint;
  v_qualified bigint;
  v_three boolean;
  v_ten boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select count(*)
  into v_completed
  from public.referrals
  where referrer_id=uid and status='completed';

  select count(*)
  into v_qualified
  from public.referrals r
  where r.referrer_id=uid
    and r.status='completed'
    and private.referral_is_premium_qualified(r.referred_id);

  select exists(
    select 1 from public.plan_grants
    where user_id=uid
      and source='referral_milestone'
      and source_id='3'
  ) into v_three;

  select exists(
    select 1 from public.plan_grants
    where user_id=uid
      and source='referral_milestone'
      and source_id='10'
  ) into v_ten;

  return query
  select
    v_completed,
    v_qualified,
    case
      when not v_three then 3
      when not v_ten then 10
      else 10
    end,
    case
      when not v_three then 'PRO'::public.plan_code
      else 'PRO_PLUS'::public.plan_code
    end,
    case
      when not v_three then 3
      else 7
    end,
    case
      when not v_three then greatest(0,3-v_qualified)
      when not v_ten then greatest(0,10-v_qualified)
      else 0
    end,
    v_three,
    v_ten;
end
$$;

revoke all on function public.get_my_referral_progress()
from public,anon;
grant execute on function public.get_my_referral_progress()
to authenticated;
