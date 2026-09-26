alter extension citext set schema extensions;

drop function if exists public.update_my_profile(text,text,text,text,text,uuid);
revoke update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(name,username,city,state,avatar_url,favorite_team_id,updated_at) on public.profiles to authenticated;
create policy "profile_self_update" on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));

create table public.leaderboard_entries (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text, city text, state varchar(2), xp bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index idx_leaderboard_global on public.leaderboard_entries(xp desc,user_id);
create index idx_leaderboard_state on public.leaderboard_entries(state,xp desc,user_id);
create index idx_leaderboard_city on public.leaderboard_entries(state,city,xp desc,user_id);
alter table public.leaderboard_entries enable row level security;
create policy "leaderboard_public_read" on public.leaderboard_entries for select to anon, authenticated using(true);

create or replace function public.sync_leaderboard_entry() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.leaderboard_entries(user_id,username,city,state,xp,updated_at)
  values(new.id,new.username::text,new.city,new.state,new.xp,now())
  on conflict(user_id) do update set username=excluded.username,city=excluded.city,state=excluded.state,xp=excluded.xp,updated_at=now();
  return new;
end $$;
revoke all on function public.sync_leaderboard_entry() from public, anon, authenticated;
create trigger profiles_sync_leaderboard after insert or update of username,city,state,xp on public.profiles for each row execute function public.sync_leaderboard_entry();

insert into public.leaderboard_entries(user_id,username,city,state,xp)
select id,username::text,city,state,xp from public.profiles
on conflict(user_id) do update set username=excluded.username,city=excluded.city,state=excluded.state,xp=excluded.xp,updated_at=now();

create index idx_subscriptions_user on public.subscriptions(user_id);
create index idx_subscriptions_plan on public.subscriptions(plan_id);
create index idx_matches_competition on public.matches(competition_id);
create index idx_matches_season on public.matches(season_id);
create index idx_matches_round on public.matches(round_id);
create index idx_matches_home_team on public.matches(home_team_id);
create index idx_matches_away_team on public.matches(away_team_id);
create index idx_match_events_match on public.match_events(match_id);
create index idx_match_events_team on public.match_events(team_id);
create index idx_match_events_player on public.match_events(player_id);
create index idx_players_team on public.players(team_id);
create index idx_profiles_favorite_team on public.profiles(favorite_team_id);
create index idx_referrals_referrer on public.referrals(referrer_id);
create index idx_ai_conversations_user on public.ai_conversations(user_id);
create index idx_ai_messages_conversation on public.ai_messages(conversation_id);
create index idx_admin_audit_actor on public.admin_audit_logs(actor_id);
create index idx_system_settings_updated_by on public.system_settings(updated_by);
