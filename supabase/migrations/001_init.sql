create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.app_role as enum ('USER','MODERATOR','ADMIN','SUPER_ADMIN');
create type public.plan_code as enum ('FREE','PRO','PRO_PLUS');
create type public.match_status as enum ('SCHEDULED','LIVE','FINISHED','POSTPONED','CANCELLED');
create type public.prediction_pick as enum ('HOME','DRAW','AWAY');

create table public.plans (id uuid primary key default gen_random_uuid(), code public.plan_code unique not null, name text not null, price_cents integer not null default 0, features jsonb not null default '{}'::jsonb, active boolean not null default true, created_at timestamptz not null default now());
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, name text not null default '', username citext unique, birth_date date, city text, state varchar(2), favorite_team_id uuid, avatar_url text, role public.app_role not null default 'USER', plan_code public.plan_code not null default 'FREE', xp bigint not null default 0 check(xp>=0), current_streak integer not null default 0, best_streak integer not null default 0, last_activity_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, plan_id uuid not null references public.plans(id), status text not null default 'inactive', provider text, external_id text, starts_at timestamptz, ends_at timestamptz, created_at timestamptz not null default now());
create table public.competitions (id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null, country text, logo_url text, active boolean not null default true, created_at timestamptz not null default now());
create table public.seasons (id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.competitions(id) on delete cascade, name text not null, starts_on date, ends_on date, is_current boolean not null default false, unique(competition_id,name));
create table public.rounds (id uuid primary key default gen_random_uuid(), season_id uuid not null references public.seasons(id) on delete cascade, name text not null, number integer, starts_at timestamptz, ends_at timestamptz, unique(season_id,name));
create table public.teams (id uuid primary key default gen_random_uuid(), name text not null, short_name text, slug text unique not null, crest_url text, city text, state varchar(2), country text default 'Brasil', created_at timestamptz not null default now());
alter table public.profiles add constraint profiles_favorite_team_fk foreign key (favorite_team_id) references public.teams(id) on delete set null;
create table public.players (id uuid primary key default gen_random_uuid(), team_id uuid references public.teams(id) on delete set null, name text not null, position text, shirt_number integer, birth_date date, nationality text, photo_url text, active boolean not null default true);
create table public.matches (id uuid primary key default gen_random_uuid(), competition_id uuid references public.competitions(id), season_id uuid references public.seasons(id), round_id uuid references public.rounds(id), provider_id text, home_team_id uuid not null references public.teams(id), away_team_id uuid not null references public.teams(id), starts_at timestamptz not null, status public.match_status not null default 'SCHEDULED', home_score integer, away_score integer, venue text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(home_team_id<>away_team_id));
create table public.match_events (id uuid primary key default gen_random_uuid(), match_id uuid not null references public.matches(id) on delete cascade, team_id uuid references public.teams(id), player_id uuid references public.players(id), minute integer, extra_minute integer, event_type text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table public.team_statistics (id uuid primary key default gen_random_uuid(), match_id uuid not null references public.matches(id) on delete cascade, team_id uuid not null references public.teams(id), stats jsonb not null default '{}'::jsonb, unique(match_id,team_id));
create table public.player_statistics (id uuid primary key default gen_random_uuid(), match_id uuid not null references public.matches(id) on delete cascade, player_id uuid not null references public.players(id), stats jsonb not null default '{}'::jsonb, unique(match_id,player_id));
create table public.predictions (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, match_id uuid not null references public.matches(id) on delete cascade, pick public.prediction_pick not null, home_score integer, away_score integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,match_id), check(home_score is null or home_score>=0), check(away_score is null or away_score>=0));
create table public.prediction_results (id uuid primary key default gen_random_uuid(), prediction_id uuid unique not null references public.predictions(id) on delete cascade, result_correct boolean not null default false, exact_score boolean not null default false, xp_awarded integer not null default 0, processed_at timestamptz not null default now());
create table public.xp_transactions (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, amount integer not null, reason text not null, metadata jsonb not null default '{}'::jsonb, idempotency_key text unique, created_at timestamptz not null default now());
create table public.levels (level integer primary key check(level>0), name text not null, min_xp bigint not null unique, icon text, created_at timestamptz not null default now());
create table public.achievements (id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, description text not null, xp_reward integer not null default 0, criteria jsonb not null default '{}'::jsonb, active boolean not null default true);
create table public.user_achievements (user_id uuid references public.profiles(id) on delete cascade, achievement_id uuid references public.achievements(id) on delete cascade, unlocked_at timestamptz not null default now(), primary key(user_id,achievement_id));
create table public.challenges (id uuid primary key default gen_random_uuid(), name text not null, type text not null, description text, xp_reward integer not null default 0, criteria jsonb not null default '{}'::jsonb, starts_at timestamptz, ends_at timestamptz, active boolean not null default true, created_at timestamptz not null default now());
create table public.challenge_entries (challenge_id uuid references public.challenges(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, progress jsonb not null default '{}'::jsonb, completed_at timestamptz, updated_at timestamptz not null default now(), primary key(challenge_id,user_id));
create table public.referrals (id uuid primary key default gen_random_uuid(), referrer_id uuid not null references public.profiles(id), referred_id uuid unique references public.profiles(id), status text not null default 'pending', reward_xp integer not null default 0, created_at timestamptz not null default now(), completed_at timestamptz, check(referrer_id<>referred_id));
create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, type text not null, title text not null, body text not null, payload jsonb not null default '{}'::jsonb, read_at timestamptz, created_at timestamptz not null default now());
create table public.ai_conversations (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, title text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.ai_messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.ai_conversations(id) on delete cascade, role text not null check(role in ('user','assistant','system')), content text not null, structured_context jsonb, created_at timestamptz not null default now());
create table public.admin_audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), action text not null, entity_type text, entity_id text, before_data jsonb, after_data jsonb, ip inet, created_at timestamptz not null default now());
create table public.system_settings (key text primary key, value jsonb not null, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now());

create index idx_matches_starts_at on public.matches(starts_at);
create index idx_matches_status_starts on public.matches(status,starts_at);
create index idx_predictions_match on public.predictions(match_id);
create index idx_predictions_user_created on public.predictions(user_id,created_at desc);
create index idx_xp_user_created on public.xp_transactions(user_id,created_at desc);
create index idx_profiles_rank_global on public.profiles(xp desc,id);
create index idx_profiles_rank_state on public.profiles(state,xp desc,id);
create index idx_profiles_rank_city on public.profiles(state,city,xp desc,id);
create index idx_notifications_user_unread on public.notifications(user_id,read_at,created_at desc);

insert into public.plans(code,name,price_cents,features) values ('FREE','Free',0,'{"predictions":true,"ranking":true}'),('PRO','Pro',1990,'{"ai":true,"advanced_stats":true}'),('PRO_PLUS','Pro+',3990,'{"ai":true,"advanced_stats":true,"priority":true}') on conflict do nothing;
insert into public.levels(level,name,min_xp) values (1,'Torcedor',0),(5,'Entendido',1000),(10,'Analista',3000),(20,'Especialista',8000),(30,'Craque',15000),(50,'Lenda',35000),(100,'Hall da Fama',100000) on conflict do nothing;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,name,username,birth_date,city,state)
 values(new.id,coalesce(new.raw_user_meta_data->>'name',''),nullif(lower(new.raw_user_meta_data->>'username'),''),nullif(new.raw_user_meta_data->>'birth_date','')::date,new.raw_user_meta_data->>'city',upper(new.raw_user_meta_data->>'state'));
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.submit_prediction(p_match_id uuid,p_pick public.prediction_pick,p_home_score integer default null,p_away_score integer default null)
returns public.predictions language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); m public.matches; p public.predictions; today date := (now() at time zone 'America/Sao_Paulo')::date; xp_id uuid;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 select * into m from public.matches where id=p_match_id for share;
 if not found then raise exception 'match_not_found'; end if;
 if m.status<>'SCHEDULED' or m.starts_at<=now() then raise exception 'predictions_closed'; end if;
 insert into public.predictions(user_id,match_id,pick,home_score,away_score) values(uid,p_match_id,p_pick,p_home_score,p_away_score)
 on conflict(user_id,match_id) do update set pick=excluded.pick,home_score=excluded.home_score,away_score=excluded.away_score,updated_at=now() returning * into p;
 insert into public.xp_transactions(user_id,amount,reason,metadata,idempotency_key) values(uid,5,'prediction_created',jsonb_build_object('match_id',p_match_id),uid::text||':prediction:'||p_match_id::text) on conflict(idempotency_key) do nothing returning id into xp_id;
 update public.profiles set xp=xp+case when xp_id is not null then 5 else 0 end,
  current_streak=case when last_activity_date=today then current_streak when last_activity_date=today-1 then current_streak+1 else 1 end,
  best_streak=greatest(best_streak,case when last_activity_date=today then current_streak when last_activity_date=today-1 then current_streak+1 else 1 end),last_activity_date=today,updated_at=now() where id=uid;
 return p;
end $$;

create or replace function public.update_my_profile(
  p_name text default null,
  p_username text default null,
  p_city text default null,
  p_state text default null,
  p_avatar_url text default null,
  p_favorite_team_id uuid default null
) returns public.profiles
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid := auth.uid(); out_profile public.profiles;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  update public.profiles
  set name=coalesce(nullif(trim(p_name),''),name),
      username=coalesce(nullif(lower(trim(p_username)),''),username),
      city=coalesce(nullif(trim(p_city),''),city),
      state=coalesce(nullif(upper(trim(p_state)),''),state),
      avatar_url=coalesce(nullif(trim(p_avatar_url),''),avatar_url),
      favorite_team_id=coalesce(p_favorite_team_id,favorite_team_id),
      updated_at=now()
  where id=uid
  returning * into out_profile;
  return out_profile;
end $$;
revoke all on function public.update_my_profile(text,text,text,text,text,uuid) from public, anon;
grant execute on function public.update_my_profile(text,text,text,text,text,uuid) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.submit_prediction(uuid,public.prediction_pick,integer,integer) from public, anon;
alter table public.profiles enable row level security; alter table public.subscriptions enable row level security; alter table public.predictions enable row level security; alter table public.prediction_results enable row level security; alter table public.xp_transactions enable row level security; alter table public.user_achievements enable row level security; alter table public.challenge_entries enable row level security; alter table public.referrals enable row level security; alter table public.notifications enable row level security; alter table public.ai_conversations enable row level security; alter table public.ai_messages enable row level security; alter table public.admin_audit_logs enable row level security; alter table public.system_settings enable row level security;

create policy "profile_self_read" on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy "subscriptions_self" on public.subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy "predictions_self" on public.predictions for select to authenticated using(user_id=(select auth.uid()));
create policy "prediction_results_self" on public.prediction_results for select to authenticated using(exists(select 1 from public.predictions p where p.id=prediction_id and p.user_id=(select auth.uid())));
create policy "xp_self" on public.xp_transactions for select to authenticated using(user_id=(select auth.uid()));
create policy "achievements_self" on public.user_achievements for select to authenticated using(user_id=(select auth.uid()));
create policy "challenge_entries_self" on public.challenge_entries for select to authenticated using(user_id=(select auth.uid()));
create policy "referrals_self" on public.referrals for select to authenticated using(referrer_id=(select auth.uid()) or referred_id=(select auth.uid()));
create policy "notifications_self" on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy "notifications_self_update" on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "ai_conversations_self" on public.ai_conversations for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "ai_messages_self" on public.ai_messages for select to authenticated using(exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));

alter table public.competitions enable row level security; alter table public.seasons enable row level security; alter table public.rounds enable row level security; alter table public.teams enable row level security; alter table public.players enable row level security; alter table public.matches enable row level security; alter table public.match_events enable row level security; alter table public.team_statistics enable row level security; alter table public.player_statistics enable row level security; alter table public.levels enable row level security; alter table public.achievements enable row level security; alter table public.challenges enable row level security; alter table public.plans enable row level security;
create policy "sports_public_read" on public.competitions for select using(true); create policy "seasons_public_read" on public.seasons for select using(true); create policy "rounds_public_read" on public.rounds for select using(true); create policy "teams_public_read" on public.teams for select using(true); create policy "players_public_read" on public.players for select using(true); create policy "matches_public_read" on public.matches for select using(true); create policy "events_public_read" on public.match_events for select using(true); create policy "team_stats_public_read" on public.team_statistics for select using(true); create policy "player_stats_public_read" on public.player_statistics for select using(true); create policy "levels_public_read" on public.levels for select using(true); create policy "achievements_public_read" on public.achievements for select using(true); create policy "challenges_public_read" on public.challenges for select using(true); create policy "plans_public_read" on public.plans for select using(true);

grant execute on function public.submit_prediction(uuid,public.prediction_pick,integer,integer) to authenticated;
