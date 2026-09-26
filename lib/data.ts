import { createClient } from '@/lib/supabase/server';
import type { Match } from '@/lib/types';

const crest = (value?: string | null) => value || '⚽';

export async function getMatches(limit = 20): Promise<Match[]> {
  const s = await createClient();
  const { data, error } = await s.from('matches').select(`
    id,starts_at,status,home_score,away_score,venue,
    competitions(name),rounds(name),
    home:teams!matches_home_team_id_fkey(id,name,short_name,crest_url),
    away:teams!matches_away_team_id_fkey(id,name,short_name,crest_url)
  `).order('starts_at',{ascending:true}).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row:any) => ({
    id: row.id,
    competition: row.competitions?.name ?? 'Competição',
    round: row.rounds?.name ?? 'Rodada',
    startsAt: row.starts_at,
    status: row.status,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    venue: row.venue ?? undefined,
    home: { id: row.home.id, name: row.home.name, shortName: row.home.short_name ?? row.home.name.slice(0,3).toUpperCase(), crest: crest(row.home.crest_url), color: '#10b981' },
    away: { id: row.away.id, name: row.away.name, shortName: row.away.short_name ?? row.away.name.slice(0,3).toUpperCase(), crest: crest(row.away.crest_url), color: '#38bdf8' },
  }));
}

export async function getMatch(id:string): Promise<Match | null> {
  const all = await getMatches(100);
  return all.find(x => x.id === id) ?? null;
}

export async function getLeaderboard(limit=100) {
  const s = await createClient();
  const { data, error } = await s.from('leaderboard_entries').select('user_id,username,city,state,xp').order('xp',{ascending:false}).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r:any,i:number)=>({position:i+1,username:r.username ?? 'jogador',city:r.city ?? '-',state:r.state ?? '-',xp:Number(r.xp ?? 0)}));
}

export async function getCurrentProfile() {
  const s = await createClient();
  const { data:{ user } } = await s.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await s.from('profiles').select('*').eq('id',user.id).single();
  if (error) throw error;
  const [{count: predictions},{count: results},{count: exact}] = await Promise.all([
    s.from('predictions').select('*',{count:'exact',head:true}).eq('user_id',user.id),
    s.from('prediction_results').select('prediction_id,predictions!inner(user_id)',{count:'exact',head:true}).eq('predictions.user_id',user.id).eq('result_correct',true),
    s.from('prediction_results').select('prediction_id,predictions!inner(user_id)',{count:'exact',head:true}).eq('predictions.user_id',user.id).eq('exact_score',true),
  ]);
  const total = predictions ?? 0, hits = results ?? 0;
  const xp = Number(profile.xp ?? 0);
  const level = xp>=100000?100:xp>=35000?50:xp>=15000?30:xp>=8000?20:xp>=3000?10:xp>=1000?5:1;
  return {...profile,email:user.email,predictions:total,hits,exact:exact??0,accuracy:total?Math.round(hits/total*100):0,level};
}
