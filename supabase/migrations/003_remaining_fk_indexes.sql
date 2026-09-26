create index idx_challenge_entries_user on public.challenge_entries(user_id);
create index idx_player_statistics_player on public.player_statistics(player_id);
create index idx_team_statistics_team on public.team_statistics(team_id);
create index idx_user_achievements_achievement on public.user_achievements(achievement_id);
