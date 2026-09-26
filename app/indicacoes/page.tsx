import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {SectionTitle} from '@/components/section-title';
import {StatCard} from '@/components/stat-card';
import {ReferralCard} from '@/components/referral-card';

export const dynamic='force-dynamic';

function planLabel(value:string|null|undefined){
  return value==='PRO_PLUS'?'PRO+':(value??'PRO');
}

export default async function IndicacoesPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const [
    {data:profile},
    {data:refs,error},
    {data:progressData,error:progressError}
  ]=await Promise.all([
    s.from('profiles').select('username').eq('id',user.id).single(),
    s.from('referrals')
      .select('id,status,reward_xp,created_at,completed_at')
      .eq('referrer_id',user.id)
      .order('created_at',{ascending:false}),
    s.rpc('get_my_referral_progress')
  ]);

  if(error) throw error;
  if(progressError) throw progressError;

  const rows=refs??[];
  const completed=rows.filter((r:any)=>r.status==='completed');
  const earned=completed.reduce((sum:number,r:any)=>sum+Number(r.reward_xp||0),0);
  const progress=Array.isArray(progressData)?progressData[0]:progressData;

  const qualified=Number(progress?.qualified_referrals??0);
  const nextMilestone=Number(progress?.next_milestone??3);
  const remaining=Number(progress?.remaining_to_next??3);
  const allClaimed=Boolean(progress?.milestone_3_claimed&&progress?.milestone_10_claimed);
  const progressPct=allClaimed
    ?100
    :Math.min(100,Math.round((qualified/Math.max(1,nextMilestone))*100));

  return <div className="space-y-6">
    <SectionTitle eyebrow="Crescimento" title="Indicações"/>

    <ReferralCard username={profile?.username||'usuario'}/>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Indicações" value={rows.length}/>
      <StatCard label="Concluídas" value={completed.length}/>
      <StatCard label="Qualificadas" value={qualified}/>
      <StatCard label="XP ganho" value={earned}/>
    </div>

    <section className="arena-card border-violet-500/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="arena-label">Recompensas premium</div>
          <h3 className="mt-1 text-xl font-black">
            {allClaimed
              ?'Todos os marcos atuais concluídos 🚀'
              :remaining+' indicação(ões) qualificada(s) para o próximo prêmio'}
          </h3>
          {!allClaimed&&<p className="mt-2 text-sm text-slate-400">
            Ao chegar em {nextMilestone}, você ganha {progress?.next_reward_days??3} dias de {planLabel(progress?.next_reward_plan)}.
          </p>}
        </div>

        {!allClaimed&&<span className="rounded-2xl bg-violet-500/10 px-4 py-3 text-sm font-black text-violet-300">
          {qualified}/{nextMilestone}
        </span>}
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-violet-500" style={{width:progressPct+'%'}}/>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={progress?.milestone_3_claimed
          ?'rounded-2xl border border-emerald-500/20 bg-emerald-500/[.06] p-4'
          :'rounded-2xl bg-white/[.04] p-4'}>
          <b className="block">3 qualificadas → 3 dias PRO</b>
          <span className={progress?.milestone_3_claimed?'text-xs text-emerald-400':'text-xs text-slate-500'}>
            {progress?.milestone_3_claimed?'Conquistado':'Aguardando'}
          </span>
        </div>

        <div className={progress?.milestone_10_claimed
          ?'rounded-2xl border border-emerald-500/20 bg-emerald-500/[.06] p-4'
          :'rounded-2xl bg-white/[.04] p-4'}>
          <b className="block">10 qualificadas → 7 dias PRO+</b>
          <span className={progress?.milestone_10_claimed?'text-xs text-emerald-400':'text-xs text-slate-500'}>
            {progress?.milestone_10_claimed?'Conquistado':'Aguardando'}
          </span>
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-600">
        Uma indicação vira qualificada depois que o convidado completa pelo menos 3 palpites distribuídos em 2 dias diferentes. Cada marco premium é liberado uma única vez por conta.
      </p>
    </section>

    <section>
      <SectionTitle eyebrow="Histórico" title="Suas indicações"/>
      <div className="arena-card overflow-hidden">
        {rows.map((r:any)=><div key={r.id} className="grid grid-cols-[1fr_auto] items-center border-b border-white/5 p-4 last:border-0">
          <div>
            <b className={r.status==='completed'?'text-emerald-400':'text-slate-300'}>
              {r.status==='completed'?'Concluída':'Pendente'}
            </b>
            <div className="mt-1 text-xs text-slate-600">{new Date(r.created_at).toLocaleString('pt-BR')}</div>
          </div>
          <div className="text-right text-sm font-bold">
            {r.status==='completed'?('+'+r.reward_xp+' XP'):'Aguardando 1º palpite'}
          </div>
        </div>)}

        {!rows.length&&<div className="p-6 text-sm text-slate-400">Você ainda não possui indicações.</div>}
      </div>
    </section>
  </div>;
}
