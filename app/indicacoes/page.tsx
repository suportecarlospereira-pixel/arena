import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SectionTitle } from '@/components/section-title';
import { StatCard } from '@/components/stat-card';
import { ReferralCard } from '@/components/referral-card';

export const dynamic='force-dynamic';

export default async function IndicacoesPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const [{data:profile},{data:refs,error}]=await Promise.all([
    s.from('profiles').select('username').eq('id',user.id).single(),
    s.from('referrals').select('id,status,reward_xp,created_at,completed_at').eq('referrer_id',user.id).order('created_at',{ascending:false})
  ]);

  if(error) throw error;
  const rows=refs??[];
  const completed=rows.filter((r:any)=>r.status==='completed');
  const earned=completed.reduce((sum:number,r:any)=>sum+Number(r.reward_xp||0),0);

  return <div className="space-y-6">
    <SectionTitle eyebrow="Crescimento" title="Indicações"/>
    <ReferralCard username={profile?.username||'usuario'}/>

    <div className="grid grid-cols-3 gap-3">
      <StatCard label="Indicações" value={rows.length}/>
      <StatCard label="Concluídas" value={completed.length}/>
      <StatCard label="XP ganho" value={earned}/>
    </div>

    <section>
      <SectionTitle eyebrow="Histórico" title="Suas indicações"/>
      <div className="arena-card overflow-hidden">
        {rows.map((r:any)=><div key={r.id} className="grid grid-cols-[1fr_auto] items-center border-b border-white/5 p-4 last:border-0">
          <div>
            <b className={r.status==='completed'?'text-emerald-400':'text-slate-300'}>{r.status==='completed'?'Concluída':'Pendente'}</b>
            <div className="mt-1 text-xs text-slate-600">{new Date(r.created_at).toLocaleString('pt-BR')}</div>
          </div>
          <div className="text-right text-sm font-bold">{r.status==='completed'?('+'+r.reward_xp+' XP'):'Aguardando 1º palpite'}</div>
        </div>)}
        {!rows.length&&<div className="p-6 text-sm text-slate-400">Você ainda não possui indicações.</div>}
      </div>
    </section>
  </div>
}
