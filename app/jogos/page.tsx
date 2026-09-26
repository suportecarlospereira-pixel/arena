import Link from 'next/link';
import { MatchCard } from '@/components/match-card';
import { SectionTitle } from '@/components/section-title';
import { getMatches } from '@/lib/data';
import { dateKeySP } from '@/lib/utils';

export const revalidate=60;

function href(view:string,competition?:string){
  const params=new URLSearchParams();
  if(view!=='all') params.set('view',view);
  if(competition) params.set('competition',competition);
  const query=params.toString();
  return query?`/jogos?${query}`:'/jogos';
}

export default async function Jogos({searchParams}:{searchParams:Promise<{view?:string;competition?:string}>}){
  const params=await searchParams;
  const view=['all','today','tomorrow','live'].includes(params.view||'')?params.view!:'all';
  const competition=params.competition||'';

  const all=await getMatches(160);
  const competitions=[...new Set(all.map(m=>m.competition))].sort((a,b)=>a.localeCompare(b,'pt-BR'));

  const today=dateKeySP(new Date());
  const tomorrowDate=new Date(Date.now()+24*60*60*1000);
  const tomorrow=dateKeySP(tomorrowDate);

  const matches=all.filter(m=>{
    if(competition&&m.competition!==competition) return false;
    if(view==='live') return m.status==='LIVE';
    if(view==='today') return dateKeySP(m.startsAt)===today;
    if(view==='tomorrow') return dateKeySP(m.startsAt)===tomorrow;
    return true;
  });

  const tabs=[['all','Todos'],['today','Hoje'],['tomorrow','Amanhã'],['live','Ao vivo']] as const;

  return <div>
    <SectionTitle eyebrow="Agenda oficial" title="Jogos reais"/>

    <div className="mb-4 flex gap-2 overflow-auto pb-1">
      {tabs.map(([value,label])=><Link
        key={value}
        href={href(value,competition||undefined)}
        className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${view===value?'bg-emerald-500 text-slate-950':'border border-white/10 bg-white/[.04] text-slate-400'}`}
      >{label}</Link>)}
    </div>

    <div className="mb-5 flex gap-2 overflow-auto pb-1">
      <Link
        href={href(view)}
        className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${!competition?'bg-sky-500 text-slate-950':'border border-white/10 bg-white/[.04] text-slate-400'}`}
      >Todos campeonatos</Link>
      {competitions.map(name=><Link
        key={name}
        href={href(view,name)}
        className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${competition===name?'bg-sky-500 text-slate-950':'border border-white/10 bg-white/[.04] text-slate-400'}`}
      >{name}</Link>)}
    </div>

    <div className="mb-5 arena-panel px-4 py-3 text-xs leading-5 text-slate-400">
      Agenda sincronizada automaticamente. Horários exibidos no fuso de Brasília.
    </div>

    <div className="grid gap-3 xl:grid-cols-2">
      {matches.map(m=><MatchCard key={m.id} match={m}/>)}
    </div>

    {!matches.length&&<div className="arena-card p-6 text-sm text-slate-400">
      Nenhuma partida encontrada para este filtro.
    </div>}
  </div>
}
