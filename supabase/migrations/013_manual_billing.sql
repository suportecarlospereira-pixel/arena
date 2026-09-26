-- ARENA manual billing operations.
-- Temporary operational path while Stripe is not connected.

alter table public.subscriptions
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_subscriptions_active_user
  on public.subscriptions(user_id)
  where status='active';

create or replace function public.admin_resolve_upgrade_request(
  p_request_id uuid,p_approve boolean,p_note text default null
)
returns jsonb
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  req public.upgrade_requests;
  plan_row public.plans;
  result_row public.profiles;
begin
  if uid is null or not private.is_admin(uid) then
    raise exception 'forbidden';
  end if;

  select *
  into req
  from public.upgrade_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'request_not_found'; end if;

  if req.status<>'PENDING' and req.status<>'CONTACTED' then
    raise exception 'request_already_resolved';
  end if;

  if p_approve then
    select *
    into plan_row
    from public.plans
    where code=req.requested_plan and active=true;

    if not found then raise exception 'plan_not_found'; end if;

    update public.subscriptions
    set status='inactive',
        ends_at=coalesce(ends_at,now()),
        updated_at=now()
    where user_id=req.user_id and status='active';

    insert into public.subscriptions(
      user_id,plan_id,status,provider,external_id,
      starts_at,ends_at,updated_at
    )
    values(
      req.user_id,
      plan_row.id,
      'active',
      'manual',
      req.id::text,
      now(),
      null,
      now()
    );

    update public.profiles
    set plan_code=req.requested_plan,updated_at=now()
    where id=req.user_id
    returning * into result_row;

    update public.upgrade_requests
    set status='RESOLVED',
        note=nullif(left(trim(coalesce(p_note,'')),500),''),
        updated_at=now()
    where id=req.id;

    insert into public.notifications(user_id,type,title,body,payload)
    values(
      req.user_id,
      'billing',
      'Plano ativado ✨',
      'Seu plano '||
        case
          when req.requested_plan='PRO_PLUS' then 'PRO+'
          else req.requested_plan::text
        end||
        ' foi ativado.',
      jsonb_build_object('plan',req.requested_plan,'source','manual')
    );

    perform private.write_audit(
      uid,
      'approve_upgrade_request',
      'upgrade_request',
      req.id::text,
      jsonb_build_object(
        'user_id',req.user_id,
        'plan',req.requested_plan,
        'provider','manual'
      )
    );

    return jsonb_build_object(
      'ok',true,
      'approved',true,
      'user_id',req.user_id,
      'plan',req.requested_plan
    );
  end if;

  update public.upgrade_requests
  set status='CANCELLED',
      note=nullif(left(trim(coalesce(p_note,'')),500),''),
      updated_at=now()
  where id=req.id;

  perform private.write_audit(
    uid,
    'reject_upgrade_request',
    'upgrade_request',
    req.id::text,
    jsonb_build_object(
      'user_id',req.user_id,
      'plan',req.requested_plan
    )
  );

  return jsonb_build_object(
    'ok',true,
    'approved',false,
    'user_id',req.user_id,
    'plan',req.requested_plan
  );
end
$$;

revoke all on function public.admin_resolve_upgrade_request(uuid,boolean,text)
  from public,anon;
grant execute on function public.admin_resolve_upgrade_request(uuid,boolean,text)
  to authenticated;

create or replace function public.admin_billing_stats()
returns table(
  pending_requests bigint,
  active_pro bigint,
  active_pro_plus bigint,
  active_manual_subscriptions bigint,
  mrr_cents bigint
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
    (select count(*) from public.upgrade_requests where status in ('PENDING','CONTACTED')),
    (select count(*) from public.profiles where plan_code='PRO'),
    (select count(*) from public.profiles where plan_code='PRO_PLUS'),
    (select count(*) from public.subscriptions where status='active' and provider='manual'),
    (
      select coalesce(sum(pl.price_cents),0)::bigint
      from public.profiles p
      join public.plans pl on pl.code=p.plan_code
      where p.plan_code<>'FREE'
    );
end
$$;

revoke all on function public.admin_billing_stats() from public,anon;
grant execute on function public.admin_billing_stats() to authenticated;
