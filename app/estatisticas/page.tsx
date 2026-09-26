import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {getMyEntitlements} from '@/lib/monetization';
import {SectionTitle} from '@/components/section-title';
import {StatCard} from '@/components/stat-card';

export const dynamic='force-dynamic';

const pickName:Record<string,string>={
  HOME:'Vitória do mandante',
  DRAW:'Empate',
  AWAY:'Vitória do visitante'
};

export default async function EstatisticasPage(){
  const [s,ent]=await Promise.all([createClient(),getMyEntitlements()]);
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  if(!ent?.advanced_stats){
    return <div className="space-y-5">
      <SectionTitle eyebrow="PRO" title="Estatísticas avançadas"/>
      <section className="arena-card p-7">
        <div className="text-4xl">📊</div>
        <h2 className="mt-4 text-2xl font-black">Entenda onde você realmente acerta</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Veja desempenho por competição, tipo de palpite, últimos 30 dias, placares exatos e precisão consolidada.
        </p>
        <Link href="/planos" className="arena-button mt-5 inline-flex">VER PLANOS</Link>
      </section>
    </div>;
  }

  const {data,error}=await s.rpc('get_my_advanced_stats');
  if(error) throw error;

  const stats=(data??{}) as any;
  const summary=stats.summary??{};
  const last30=stats.last30??{};
  const byPick=Array.isArray(stats.by_pick)?stats.by_pick:[];
  const byCompetition=Array.isArray(stats.by_competition)?stats.by_competition:[];

  return <div className="space-y-7">
    <div>
      <SectionTitle eyebrow="PRO Analytics" title="Suas estatísticas"/>
      <p className="text-sm text-slate-400">A análise usa somente palpites já registrados no ARENA.</p>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard label="Palpites" value={summary.predictions??0}/>
      <StatCard label="Encerrados" value={summary.settled??0}/>
      <StatCard label="Acertos" value={summary.hits??0}/>
      <StatCard label="Placares exatos" value={summary.exact??0}/>
      <StatCard label="Precisão" value={`${summary.accuracy??0}%`}/>
    </div>

    <section className="arena-card p-5">
      <div className="arena-label">Últimos 30 dias</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Palpites" value={last30.predictions??0}/>
        <StatCard label="Acertos" value={last30.hits??0}/>
        <StatCard label="Precisão" value={`${last30.accuracy??0}%`}/>
      </div>
    </section>

    <section>
      <SectionTitle eyebrow="Comportamento" title="Por tipo de palpite"/>
      <div className="grid gap-3 md:grid-cols-3">
        {byPick.map((x:any)=><div key={x.pick} className="arena-card p-5">
          <b>{pickName[x.pick]??x.pick}</b>
          <div className="mt-4 text-3xl font-black">{x.accuracy}%</div>
          <div className="mt-1 text-xs text-slate-500">{x.hits} acertos em {x.predictions} palpites</div>
        </div>)}
        {!byPick.length&&<div className="arena-card p-5 text-sm text-slate-400">Ainda não há dados suficientes.</div>}
      </div>
    </section>

    <section>
      <SectionTitle eyebrow="Campeonatos" title="Por competição"/>
      <div className="arena-card overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_80px] border-b border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600">
          <span>Competição</span><span className="text-right">Palpites</span><span className="text-right">Precisão</span>
        </div>
        {byCompetition.map((x:any)=><div key={x.competition} className="grid grid-cols-[1fr_80px_80px] items-center border-b border-white/5 px-4 py-4 last:border-0">
          <div><b>{x.competition}</b><div className="text-xs text-slate-600">{x.hits} acertos • {x.exact} exatos</div></div>
          <span className="text-right">{x.predictions}</span>
          <b className="text-right text-emerald-400">{x.accuracy}%</b>
        </div>)}
        {!byCompetition.length&&<div className="p-5 text-sm text-slate-400">Ainda não há partidas encerradas suficientes.</div>}
      </div>
    </section>
  </div>
}
