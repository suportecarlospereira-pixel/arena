import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SectionTitle } from '@/components/section-title';

export const dynamic='force-dynamic';

const periods=[
  ['all','Geral'],
  ['weekly','Semanal'],
  ['monthly','Mensal'],
  ['season','Temporada'],
] as const;

export default async function RankingPage({searchParams}:{searchParams:Promise<{scope?:string;period?:string}>}){
  const params=await searchParams;
  const scope=['global','state','city'].includes(params.scope||'')?params.scope!:'global';
  const period=['all','weekly','monthly','season'].includes(params.period||'')?params.period!:'all';

  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();

  let state:string|null=null;
  let city:string|null=null;
  if(user){
    const {data:profile}=await s.from('profiles').select('state,city').eq('id',user.id).single();
    state=profile?.state??null;
    city=profile?.city??null;
  }

  const effectiveScope=(scope==='state'&&!state)||(scope==='city'&&(!state||!city))?'global':scope;

  const {data,error}=await s.rpc('get_leaderboard',{
    p_scope:effectiveScope,
    p_period:period,
    p_state:state,
    p_city:city,
    p_limit:100
  });
  if(error) throw error;

  return <div>
    <SectionTitle eyebrow="Competição" title="Ranking"/>

    <div className="mb-3 flex gap-2 overflow-auto pb-1">
      {periods.map(([value,label])=><Link
        key={value}
        href={`/ranking?scope=${effectiveScope}&period=${value}`}
        className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${period===value?'bg-emerald-500 text-slate-950':'border border-white/10 bg-white/[.04] text-slate-400'}`}
      >{label}</Link>)}
    </div>

    <div className="mb-5 flex gap-2 overflow-auto pb-1">
      <Link href={`/ranking?scope=global&period=${period}`} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${effectiveScope==='global'?'bg-sky-500 text-slate-950':'border border-white/10 bg-white/[.04] text-slate-400'}`}>Global</Link>
      {state&&<Link href={`/ranking?scope=state&period=${period}`} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${effectiveScope==='state'?'bg-sky-500 text-slate-950':'border border-white/10 bg-white/[.04] text-slate-400'}`}>{state}</Link>}
      {city&&<Link href={`/ranking?scope=city&period=${period}`} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${effectiveScope==='city'?'bg-sky-500 text-slate-950':'border border-white/10 bg-white/[.04] text-slate-400'}`}>{city}</Link>}
    </div>

    <div className="arena-card overflow-hidden">
      <div className="grid grid-cols-[55px_1fr_90px] border-b border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600">
        <span>#</span><span>Jogador</span><span className="text-right">XP</span>
      </div>
      {(data??[]).map((r:any)=><div key={r.user_id} className="grid grid-cols-[55px_1fr_90px] items-center border-b border-white/5 px-4 py-4 last:border-0">
        <b className={Number(r.rank_position)<=3?'text-amber-400':''}>{r.rank_position}</b>
        <div>
          <b>@{r.username||'jogador'}</b>
          <div className="text-xs text-slate-600">{r.city||'-'}/{r.state||'-'}</div>
        </div>
        <b className="text-right">{Number(r.xp).toLocaleString('pt-BR')}</b>
      </div>)}
      {!data?.length&&<div className="p-6 text-sm text-slate-400">Ainda não há XP neste período.</div>}
    </div>
  </div>
}
