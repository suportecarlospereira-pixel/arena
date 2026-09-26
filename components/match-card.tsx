import Link from 'next/link';
import type { Match } from '@/lib/types';
import { fmtDate, matchStatusLabel } from '@/lib/utils';

export function MatchCard({match}:{match:Match}) {
  const showScore = match.status === 'LIVE' || match.status === 'FINISHED';

  return (
    <Link
      href={`/match/${match.id}`}
      className="arena-card block p-4 transition hover:-translate-y-0.5 hover:border-emerald-500/40"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span className="truncate">
          {match.competition}{match.round ? ` • ${match.round}` : ''}
        </span>
        <span className={match.status === 'LIVE' ? 'font-black text-red-400' : ''}>
          {matchStatusLabel(match.status)}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Team name={match.home.name} crest={match.home.crest}/>
        <div className="text-center">
          <div className="rounded-xl bg-white/[.06] px-3 py-2 text-lg font-black">
            {showScore ? `${match.homeScore ?? 0} × ${match.awayScore ?? 0}` : 'VS'}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">{fmtDate(match.startsAt)}</div>
        </div>
        <Team right name={match.away.name} crest={match.away.crest}/>
      </div>

      <div className="mt-4 text-center text-xs font-bold text-emerald-400">
        {match.status === 'SCHEDULED' ? 'FAZER PALPITE →' : 'VER PARTIDA →'}
      </div>
    </Link>
  );
}

function Team({name,crest,right}:{name:string;crest?:string;right?:boolean}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${right?'flex-row-reverse text-right':''}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/[.06]">
        {crest
          ? <img src={crest} alt="" className="h-9 w-9 object-contain"/>
          : <span className="text-xl">⚽</span>}
      </span>
      <b className="min-w-0 truncate text-sm sm:text-base">{name}</b>
    </div>
  );
}
