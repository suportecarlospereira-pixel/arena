import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SectionTitle } from '@/components/section-title';
import { fmtDate, matchStatusLabel } from '@/lib/utils';

export const dynamic='force-dynamic';

export default async function PalpitesPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data,error}=await s.from('predictions').select(`
    id,pick,home_score,away_score,created_at,
    matches(
      id,starts_at,status,home_score,away_score,
      home:teams!matches_home_team_id_fkey(name,short_name),
      away:teams!matches_away_team_id_fkey(name,short_name)
    ),
    prediction_results(result_correct,exact_score,xp_awarded)
  `).eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);

  if(error) throw error;

  return <div>
    <SectionTitle eyebrow="Seu histórico" title="Meus palpites"/>
    <div className="space-y-3">
      {(data??[]).map((row:any)=>{
        const m=row.matches;
        const result=Array.isArray(row.prediction_results)?row.prediction_results[0]:row.prediction_results;
        return <Link key={row.id} href={`/match/${m.id}`} className="arena-card block p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{fmtDate(m.starts_at)}</span>
            <span>{matchStatusLabel(m.status)}</span>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <b>{m.home.name}</b>
            <div className="text-center">
              <div className="text-lg font-black">{row.home_score ?? '-'} × {row.away_score ?? '-'}</div>
              <div className="text-[10px] text-slate-600">SEU PALPITE</div>
            </div>
            <b className="text-right">{m.away.name}</b>
          </div>
          {result&&<div className="mt-3 flex items-center justify-between rounded-xl bg-white/[.04] px-3 py-2 text-xs">
            <span className={result.exact_score?'text-amber-400':result.result_correct?'text-emerald-400':'text-slate-500'}>
              {result.exact_score?'PLACAR EXATO':result.result_correct?'ACERTOU':'NÃO ACERTOU'}
            </span>
            <b>+{result.xp_awarded} XP</b>
          </div>}
        </Link>
      })}
      {!data?.length&&<div className="arena-card p-6 text-sm text-slate-400">Você ainda não fez nenhum palpite.</div>}
    </div>
  </div>
}
