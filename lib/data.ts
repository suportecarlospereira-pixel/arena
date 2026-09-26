import { createClient } from '@/lib/supabase/server';
import type { Match } from '@/lib/types';

function mapMatch(row:any): Match {
  return {
    id: row.id,
    competition: row.competitions?.name ?? 'Competição',
    round: row.rounds?.name ?? '',
    startsAt: row.starts_at,
    status: row.status,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    venue: row.venue ?? undefined,
    provider: row.provider ?? undefined,
    providerId: row.provider_id ?? undefined,
    statusDetail: row.metadata?.status_detail ?? row.metadata?.status_short ?? undefined,
    home: {
      id: row.home.id,
      name: row.home.name,
      shortName: row.home.short_name ?? row.home.name.slice(0,3).toUpperCase(),
      crest: row.home.crest_url ?? undefined,
    },
    away: {
      id: row.away.id,
      name: row.away.name,
      shortName: row.away.short_name ?? row.away.name.slice(0,3).toUpperCase(),
      crest: row.away.crest_url ?? undefined,
    },
  };
}

const MATCH_SELECT = `
  id,starts_at,status,home_score,away_score,venue,provider,provider_id,metadata,
  competitions(name),rounds(name),
  home:teams!matches_home_team_id_fkey(id,name,short_name,crest_url),
  away:teams!matches_away_team_id_fkey(id,name,short_name,crest_url)
`;

export async function getMatches(limit = 60): Promise<Match[]> {
  const s = await createClient();
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  const { data, error } = await s
    .from('matches')
    .select(MATCH_SELECT)
    .gte('starts_at', cutoff)
    .neq('status','CANCELLED')
    .order('starts_at',{ascending:true})
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapMatch);
}

export async function getMatch(id:string): Promise<Match | null> {
  const s = await createClient();
  const { data, error } = await s
    .from('matches')
    .select(MATCH_SELECT)
    .eq('id',id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapMatch(data) : null;
}

export async function getCurrentChallenge(){
  const s=await createClient();
  const now=new Date().toISOString();

  const {data:challenge,error}=await s
    .from('challenges')
    .select('id,name,description,xp_reward,criteria,starts_at,ends_at')
    .eq('active',true)
    .lte('starts_at',now)
    .gt('ends_at',now)
    .order('xp_reward',{ascending:true})
    .limit(1)
    .maybeSingle();

  if(error) throw error;
  if(!challenge) return null;

  const {data:{user}}=await s.auth.getUser();
  let current=0;
  let completed=false;

  if(user){
    const {data:entry}=await s
      .from('challenge_entries')
      .select('progress,completed_at')
      .eq('challenge_id',challenge.id)
      .eq('user_id',user.id)
      .maybeSingle();

    current=Number(entry?.progress?.predictions??0);
    completed=Boolean(entry?.completed_at);
  }

  const needed=Number(challenge.criteria?.predictions??0);
  return {
    ...challenge,
    current,
    needed,
    completed,
    percent:needed?Math.min(100,Math.round(current/needed*100)):0
  };
}

export async function getCurrentProfile() {
  const s = await createClient();
  const { data:{ user } } = await s.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await s
    .from('profiles')
    .select('*')
    .eq('id',user.id)
    .single();

  if (error) throw error;

  const [{count: predictions},{count: results},{count: exact}] = await Promise.all([
    s.from('predictions').select('*',{count:'exact',head:true}).eq('user_id',user.id),
    s.from('prediction_results').select('prediction_id,predictions!inner(user_id)',{count:'exact',head:true}).eq('predictions.user_id',user.id).eq('result_correct',true),
    s.from('prediction_results').select('prediction_id,predictions!inner(user_id)',{count:'exact',head:true}).eq('predictions.user_id',user.id).eq('exact_score',true),
  ]);

  const total = predictions ?? 0;
  const hits = results ?? 0;
  const xp = Number(profile.xp ?? 0);
  const level = xp>=100000?100:xp>=35000?50:xp>=15000?30:xp>=8000?20:xp>=3000?10:xp>=1000?5:1;

  return {
    ...profile,
    email:user.email,
    predictions:total,
    hits,
    exact:exact??0,
    accuracy:total?Math.round(hits/total*100):0,
    level
  };
}
