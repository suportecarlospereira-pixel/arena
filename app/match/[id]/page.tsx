import { notFound } from 'next/navigation';
import { getMatch } from '@/lib/data';
import { fmtDate, matchStatusLabel } from '@/lib/utils';
import { PredictionForm } from '@/components/prediction-form';
import { SectionTitle } from '@/components/section-title';

export const dynamic = 'force-dynamic';

export default async function MatchPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const m=await getMatch(id);

  if(!m) notFound();

  const showScore = m.status === 'LIVE' || m.status === 'FINISHED';

  return (
    <div className="space-y-5">
      <section className="arena-card p-5 sm:p-7">
        <div className="text-center text-xs text-slate-500">{m.competition}</div>
        <div className="mt-2 text-center text-xs font-bold text-emerald-400">
          {matchStatusLabel(m.status)}
        </div>

        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Team crest={m.home.crest} name={m.home.name}/>
          <div className="text-center">
            <div className="rounded-2xl bg-white/[.06] px-4 py-3 text-xl font-black">
              {showScore ? `${m.homeScore ?? 0} × ${m.awayScore ?? 0}` : 'VS'}
            </div>
            <div className="mt-2 text-[11px] text-slate-500">{fmtDate(m.startsAt)}</div>
          </div>
          <Team crest={m.away.crest} name={m.away.name}/>
        </div>

        {m.venue && <div className="mt-5 text-center text-xs text-slate-600">{m.venue}</div>}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-5">
          <section className="arena-card p-5">
            <SectionTitle eyebrow="Dados reais" title="Informações da partida"/>
            <p className="text-sm leading-6 text-slate-400">
              Os dados desta partida são sincronizados do provider esportivo. Estatísticas detalhadas só aparecem quando estiverem disponíveis na fonte.
            </p>
          </section>

          <section className="arena-card p-5">
            <SectionTitle eyebrow="Inteligência" title="Arena AI"/>
            <p className="text-sm leading-6 text-slate-400">
              A Arena AI consulta somente os dados reais armazenados no banco e não inventa estatísticas ausentes.
            </p>
          </section>
        </div>

        {m.status === 'SCHEDULED'
          ? <PredictionForm matchId={m.id} home={m.home.shortName} away={m.away.shortName}/>
          : <div className="arena-card p-5 text-sm text-slate-400">
              Palpites estão fechados para esta partida.
            </div>}
      </div>
    </div>
  );
}

function Team({name,crest}:{name:string;crest?:string}) {
  return (
    <div className="text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-3xl bg-white/[.06]">
        {crest
          ? <img src={crest} alt="" className="h-14 w-14 object-contain"/>
          : <span className="text-3xl">⚽</span>}
      </div>
      <b className="mt-2 block text-sm sm:text-base">{name}</b>
    </div>
  );
}
