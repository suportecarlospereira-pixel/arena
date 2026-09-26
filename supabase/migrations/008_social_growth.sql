-- ARENA social growth layer.
-- Adds public profiles, follows, feed, private leagues, competition rankings,
-- equipped achievement titles and streak shields.

alter table public.profiles
  add column if not exists bio text,
  add column if not exists equipped_achievement_id uuid references public.achievements(id) on delete set null,
  add column if not exists streak_freezes integer not null default 1;

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio)<=160);

alter table public.profiles drop constraint if exists profiles_streak_freezes_range;
alter table public.profiles add constraint profiles_streak_freezes_range
  check (streak_freezes between 0 and 3);

create table if not exists public.user_follows(
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,following_id),
  check(follower_id<>following_id)
);

create table if not exists public.leagues(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  invite_code text unique not null default upper(substr(encode(gen_random_bytes(8),'hex'),1,10)),
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(char_length(trim(name)) between 3 and 60),
  check(description is null or char_length(description)<=300)
);

create table if not exists public.league_members(
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'MEMBER'
    check(member_role in ('OWNER','MODERATOR','MEMBER')),
  joined_at timestamptz not null default now(),
  primary key(league_id,user_id)
);

create table if not exists public.activity_feed(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_follows_following
  on public.user_follows(following_id,created_at desc);
create index if not exists idx_league_members_user
  on public.league_members(user_id,joined_at desc);
create index if not exists idx_leagues_owner
  on public.leagues(owner_id);
create index if not exists idx_profiles_equipped_achievement
  on public.profiles(equipped_achievement_id);
create index if not exists idx_activity_feed_user_time
  on public.activity_feed(user_id,created_at desc);
create index if not exists idx_activity_feed_time
  on public.activity_feed(created_at desc);

alter table public.user_follows enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.activity_feed enable row level security;

create or replace function private.is_league_member(p_league_id uuid,p_user_id uuid)
returns boolean
language sql stable security definer
set search_path=public,private,pg_catalog
as $$
  select exists(
    select 1 from public.league_members
    where league_id=p_league_id and user_id=p_user_id
  );
$$;

revoke all on function private.is_league_member(uuid,uuid) from public,anon,authenticated;

drop policy if exists follows_self_select on public.user_follows;
create policy follows_self_select on public.user_follows
for select to authenticated
using(follower_id=(select auth.uid()) or following_id=(select auth.uid()));

drop policy if exists follows_self_insert on public.user_follows;
create policy follows_self_insert on public.user_follows
for insert to authenticated
with check(follower_id=(select auth.uid()));

drop policy if exists follows_self_delete on public.user_follows;
create policy follows_self_delete on public.user_follows
for delete to authenticated
using(follower_id=(select auth.uid()));

drop policy if exists leagues_visible on public.leagues;
create policy leagues_visible on public.leagues
for select to authenticated
using(
  not is_private
  or owner_id=(select auth.uid())
  or private.is_league_member(id,(select auth.uid()))
);

drop policy if exists league_members_visible on public.league_members;
create policy league_members_visible on public.league_members
for select to authenticated
using(
  user_id=(select auth.uid())
  or exists(
    select 1 from public.leagues l
    where l.id=league_members.league_id
      and (
        not l.is_private
        or l.owner_id=(select auth.uid())
        or private.is_league_member(l.id,(select auth.uid()))
      )
  )
);

revoke all on table public.activity_feed from anon,authenticated;
revoke all on table public.leagues from anon,authenticated;
revoke all on table public.league_members from anon,authenticated;
grant select on public.leagues,public.league_members to authenticated;

revoke all on table public.user_follows from anon,authenticated;
grant select,insert,delete on public.user_follows to authenticated;

grant update(name,username,city,state,avatar_url,favorite_team_id,bio,updated_at)
  on public.profiles to authenticated;

create or replace function private.log_activity(
  p_user_id uuid,
  p_type text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
begin
  insert into public.activity_feed(user_id,activity_type,entity_type,entity_id,payload)
  values(p_user_id,p_type,p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb));
end
$$;

revoke all on function private.log_activity(uuid,text,text,text,jsonb)
  from public,anon,authenticated;

create or replace function private.activity_prediction_insert()
returns trigger
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
begin
  perform private.log_activity(
    new.user_id,'prediction','prediction',new.id::text,
    jsonb_build_object('match_id',new.match_id)
  );
  return new;
end
$$;

drop trigger if exists activity_prediction_insert on public.predictions;
create trigger activity_prediction_insert
after insert on public.predictions
for each row execute function private.activity_prediction_insert();

create or replace function private.activity_achievement_insert()
returns trigger
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
declare a public.achievements;
begin
  select * into a from public.achievements where id=new.achievement_id;
  perform private.log_activity(
    new.user_id,'achievement','achievement',new.achievement_id::text,
    jsonb_build_object('name',a.name,'code',a.code,'xp_reward',a.xp_reward)
  );
  return new;
end
$$;

drop trigger if exists activity_achievement_insert on public.user_achievements;
create trigger activity_achievement_insert
after insert on public.user_achievements
for each row execute function private.activity_achievement_insert();

create or replace function private.activity_challenge_complete()
returns trigger
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
declare c public.challenges;
begin
  if old.completed_at is null and new.completed_at is not null then
    select * into c from public.challenges where id=new.challenge_id;
    perform private.log_activity(
      new.user_id,'challenge_completed','challenge',new.challenge_id::text,
      jsonb_build_object('name',c.name,'xp_reward',c.xp_reward)
    );
  end if;
  return new;
end
$$;

drop trigger if exists activity_challenge_complete on public.challenge_entries;
create trigger activity_challenge_complete
after update of completed_at on public.challenge_entries
for each row execute function private.activity_challenge_complete();

create or replace function public.get_public_profile(p_username text)
returns table(
  profile_id uuid,username text,name text,bio text,city text,state varchar,xp bigint,
  current_streak integer,best_streak integer,streak_freezes integer,
  favorite_team_name text,favorite_team_crest text,
  equipped_title text,equipped_title_code text,
  followers bigint,following bigint,predictions bigint,hits bigint,exact_hits bigint,
  accuracy integer,is_following boolean
)
language plpgsql stable security definer
set search_path=public,extensions,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  return query
  select
    p.id,p.username::text,p.name,p.bio,p.city,p.state,p.xp,
    p.current_streak,p.best_streak,p.streak_freezes,
    t.name,t.crest_url,a.name,a.code,
    (select count(*) from public.user_follows f where f.following_id=p.id),
    (select count(*) from public.user_follows f where f.follower_id=p.id),
    (select count(*) from public.predictions pr where pr.user_id=p.id),
    (select count(*) from public.prediction_results rr join public.predictions pr on pr.id=rr.prediction_id where pr.user_id=p.id and rr.result_correct),
    (select count(*) from public.prediction_results rr join public.predictions pr on pr.id=rr.prediction_id where pr.user_id=p.id and rr.exact_score),
    coalesce((
      select round(100.0*count(*) filter(where rr.result_correct)/nullif(count(*),0))::integer
      from public.prediction_results rr
      join public.predictions pr on pr.id=rr.prediction_id
      where pr.user_id=p.id
    ),0),
    case when uid is null then false else exists(
      select 1 from public.user_follows f
      where f.follower_id=uid and f.following_id=p.id
    ) end
  from public.profiles p
  left join public.teams t on t.id=p.favorite_team_id
  left join public.achievements a on a.id=p.equipped_achievement_id
  where p.username=lower(trim(p_username))::extensions.citext
  limit 1;
end
$$;

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon,authenticated;

create or replace function public.follow_user(p_username text,p_follow boolean default true)
returns boolean
language plpgsql security definer
set search_path=public,private,extensions,pg_catalog
as $$
declare uid uuid:=auth.uid(); target uuid; actor_username text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select id into target
  from public.profiles
  where username=lower(trim(p_username))::extensions.citext
  limit 1;

  if target is null then raise exception 'user_not_found'; end if;
  if target=uid then raise exception 'cannot_follow_self'; end if;

  if p_follow then
    insert into public.user_follows(follower_id,following_id)
    values(uid,target)
    on conflict do nothing;

    if found then
      select username::text into actor_username
      from public.profiles where id=uid;

      insert into public.notifications(user_id,type,title,body,payload)
      values(
        target,'social','Novo seguidor',
        '@'||coalesce(actor_username,'jogador')||' começou a seguir você.',
        jsonb_build_object('username',actor_username)
      );

      perform private.log_activity(
        uid,'follow','profile',target::text,
        jsonb_build_object('username',p_username)
      );
    end if;
  else
    delete from public.user_follows
    where follower_id=uid and following_id=target;
  end if;

  return p_follow;
end
$$;

revoke all on function public.follow_user(text,boolean) from public,anon;
grant execute on function public.follow_user(text,boolean) to authenticated;

create or replace function public.get_social_feed(p_limit integer default 50)
returns table(
  activity_id bigint,username text,name text,avatar_url text,
  activity_type text,entity_type text,entity_id text,payload jsonb,created_at timestamptz
)
language plpgsql stable security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  return query
  select
    af.id,p.username::text,p.name,p.avatar_url,
    af.activity_type,af.entity_type,af.entity_id,
    case when af.activity_type='prediction' then af.payload-'pick' else af.payload end,
    af.created_at
  from public.activity_feed af
  join public.profiles p on p.id=af.user_id
  where af.user_id=uid
     or exists(
       select 1 from public.user_follows f
       where f.follower_id=uid and f.following_id=af.user_id
     )
  order by af.created_at desc
  limit least(greatest(p_limit,1),100);
end
$$;

revoke all on function public.get_social_feed(integer) from public,anon;
grant execute on function public.get_social_feed(integer) to authenticated;

create or replace function public.get_user_activity(p_username text,p_limit integer default 30)
returns table(
  activity_id bigint,activity_type text,entity_type text,
  entity_id text,payload jsonb,created_at timestamptz
)
language sql stable security definer
set search_path=public,extensions,pg_catalog
as $$
  select
    af.id,af.activity_type,af.entity_type,af.entity_id,
    case when af.activity_type='prediction' then af.payload-'pick' else af.payload end,
    af.created_at
  from public.activity_feed af
  join public.profiles p on p.id=af.user_id
  where p.username=lower(trim(p_username))::extensions.citext
  order by af.created_at desc
  limit least(greatest(p_limit,1),50);
$$;

revoke all on function public.get_user_activity(text,integer) from public;
grant execute on function public.get_user_activity(text,integer) to anon,authenticated;

create or replace function public.set_equipped_achievement(p_achievement_id uuid)
returns boolean
language plpgsql security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  if p_achievement_id is null then
    update public.profiles
    set equipped_achievement_id=null,updated_at=now()
    where id=uid;
    return true;
  end if;

  if not exists(
    select 1 from public.user_achievements
    where user_id=uid and achievement_id=p_achievement_id
  ) then
    raise exception 'achievement_not_unlocked';
  end if;

  update public.profiles
  set equipped_achievement_id=p_achievement_id,updated_at=now()
  where id=uid;

  return true;
end
$$;

revoke all on function public.set_equipped_achievement(uuid) from public,anon;
grant execute on function public.set_equipped_achievement(uuid) to authenticated;

create or replace function public.create_league(
  p_name text,p_description text default null,p_private boolean default true
)
returns public.leagues
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
declare uid uuid:=auth.uid(); out_row public.leagues;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(coalesce(p_name,'')))<3 then raise exception 'invalid_name'; end if;

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

revoke all on function public.create_league(text,text,boolean) from public,anon;
grant execute on function public.create_league(text,text,boolean) to authenticated;

create or replace function public.join_league(p_invite_code text)
returns uuid
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
declare uid uuid:=auth.uid(); l public.leagues;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into l
  from public.leagues
  where invite_code=upper(trim(p_invite_code))
  limit 1;

  if not found then raise exception 'league_not_found'; end if;

  insert into public.league_members(league_id,user_id,member_role)
  values(l.id,uid,'MEMBER')
  on conflict do nothing;

  perform private.log_activity(
    uid,'league_joined','league',l.id::text,
    jsonb_build_object('name',l.name)
  );

  return l.id;
end
$$;

revoke all on function public.join_league(text) from public,anon;
grant execute on function public.join_league(text) to authenticated;

create or replace function public.leave_league(p_league_id uuid)
returns boolean
language plpgsql security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid(); l_owner uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select owner_id into l_owner
  from public.leagues
  where id=p_league_id;

  if l_owner is null then raise exception 'league_not_found'; end if;
  if l_owner=uid then raise exception 'owner_cannot_leave'; end if;

  delete from public.league_members
  where league_id=p_league_id and user_id=uid;

  return true;
end
$$;

revoke all on function public.leave_league(uuid) from public,anon;
grant execute on function public.leave_league(uuid) to authenticated;

create or replace function public.get_league_leaderboard(
  p_league_id uuid,p_period text default 'all',p_limit integer default 100
)
returns table(
  rank_position bigint,user_id uuid,username text,name text,
  xp bigint,predictions bigint,hits bigint
)
language plpgsql stable security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid(); v_from timestamptz; v_private boolean;
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

  return query
  with stats as (
    select
      lm.user_id,p.username::text username,p.name,
      count(pr.id) filter(where v_from is null or m.starts_at>=v_from)::bigint predictions,
      count(rr.id) filter(
        where rr.result_correct and (v_from is null or m.starts_at>=v_from)
      )::bigint hits,
      (
        5*count(pr.id) filter(where v_from is null or m.starts_at>=v_from)
        +coalesce(sum(rr.xp_awarded) filter(where v_from is null or m.starts_at>=v_from),0)
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

create or replace function public.get_sports_leaderboard(
  p_competition_id uuid,p_round_id uuid default null,p_limit integer default 100
)
returns table(
  rank_position bigint,user_id uuid,username text,city text,state varchar,
  points bigint,predictions bigint,hits bigint,exact_hits bigint
)
language sql stable security definer
set search_path=public,pg_catalog
as $$
  with stats as (
    select
      p.id user_id,p.username::text username,p.city,p.state,
      count(pr.id)::bigint predictions,
      count(rr.id) filter(where rr.result_correct)::bigint hits,
      count(rr.id) filter(where rr.exact_score)::bigint exact_hits,
      (5*count(pr.id)+coalesce(sum(rr.xp_awarded),0))::bigint points
    from public.profiles p
    join public.predictions pr on pr.user_id=p.id
    join public.matches m on m.id=pr.match_id
    left join public.prediction_results rr on rr.prediction_id=pr.id
    where m.competition_id=p_competition_id
      and (p_round_id is null or m.round_id=p_round_id)
    group by p.id,p.username,p.city,p.state
  )
  select
    row_number() over(order by points desc,user_id),
    user_id,username,city,state,points,predictions,hits,exact_hits
  from stats
  order by points desc,user_id
  limit least(greatest(p_limit,1),200);
$$;

revoke all on function public.get_sports_leaderboard(uuid,uuid,integer) from public;
grant execute on function public.get_sports_leaderboard(uuid,uuid,integer)
  to anon,authenticated;

create or replace function private.activity_achievement_reward()
returns trigger
language plpgsql security definer
set search_path=public,private,pg_catalog
as $$
declare a public.achievements;
begin
  select * into a from public.achievements where id=new.achievement_id;

  if a.code='SEVEN_DAY_STREAK' then
    update public.profiles
    set streak_freezes=least(3,streak_freezes+1),updated_at=now()
    where id=new.user_id;

    insert into public.notifications(user_id,type,title,body,payload)
    values(
      new.user_id,'streak','Você ganhou um escudo 🛡️',
      'Sua sequência de 7 dias rendeu um escudo para proteger um dia perdido.',
      jsonb_build_object('achievement_id',new.achievement_id)
    );
  end if;

  return new;
end
$$;

drop trigger if exists activity_achievement_reward on public.user_achievements;
create trigger activity_achievement_reward
after insert on public.user_achievements
for each row execute function private.activity_achievement_reward();

update public.activity_feed
set payload=payload-'pick'
where activity_type='prediction' and payload ? 'pick';

revoke all on function private.activity_prediction_insert() from public,anon,authenticated;
revoke all on function private.activity_achievement_insert() from public,anon,authenticated;
revoke all on function private.activity_challenge_complete() from public,anon,authenticated;
revoke all on function private.activity_achievement_reward() from public,anon,authenticated;
