import {createPublicClient} from '@/lib/supabase/public';
import {getMyEntitlements,getMyPlanStatus,formatPlanPrice} from '@/lib/monetization';
import {SectionTitle} from '@/components/section-title';
import {UpgradeButton} from '@/components/upgrade-button';
import {PromoRedeem} from '@/components/promo-redeem';\nimport {PricingViewTracker} from '@/components/pricing-view-tracker';

export const dynamic='force-dynamic';

const descriptions:Record<string,string>={
  FREE:'Para entrar na competição e usar o núcleo completo de palpites.',
  PRO:'Para quem acompanha desempenho e usa a Arena com frequência.',
  PRO_PLUS:'Para usuários intensivos, criadores de ligas e power users.'
};

const bullets:Record<string,string[]>={
  FREE:[
    'Palpites gratuitos e XP',
    'Rankings e comunidade',
    '5 consultas Arena AI por dia',
    'Criação de 1 liga privada',
    'Notificações e streak'
  ],
  PRO:[
    'Tudo do FREE',
    '50 consultas Arena AI por dia',
    'Até 5 ligas privadas',
    'Estatísticas avançadas',
    'Experiência sem espaços patrocinados'
  ],
  PRO_PLUS:[
    'Tudo do PRO',
    '200 consultas Arena AI por dia',
    'Até 20 ligas privadas',
    'Prioridade em recursos premium',
    'Perfil preparado para benefícios exclusivos'
  ]
};

function label(plan:string|null|undefined){
  return plan==='PRO_PLUS'?'PRO+':(plan??'FREE');
}

export default async function PlanosPage(){
  const s=createPublicClient();
  const [{data:plans,error},ent,status]=await Promise.all([
    s.from('plans').select('code,name,price_cents,features').eq('active',true).order('price_cents'),
    getMyEntitlements(),
    getMyPlanStatus()
  ]);

  if(error) throw error;

  const billingPlan=status?.billing_plan_code??ent?.plan_code??null;
  const trialActive=Boolean(status?.grant_plan_code&&status?.grant_ends_at);

  return <div className="space-y-7">\n    <PricingViewTracker enabled={Boolean(ent)}/>
    <div>
      <SectionTitle eyebrow="ARENA Premium" title="Escolha como quer competir"/>
      <p className="max-w-2xl text-sm leading-6 text-slate-400">
        Palpites continuam gratuitos. Os planos pagos financiam inteligência, estatísticas e recursos de comunidade — nunca dão vantagem na pontuação de um palpite.
      </p>
    </div>

    {trialActive&&<section className="arena-card border-violet-500/30 p-5">
      <div className="arena-label">Benefício temporário ativo</div>
      <h3 className="mt-1 text-xl font-black">{label(status?.grant_plan_code)} liberado por trial</h3>
      <p className="mt-2 text-sm text-slate-400">
        Seu plano pago continua {label(status?.billing_plan_code)}. O benefício temporário termina em{' '}
        {new Date(status!.grant_ends_at!).toLocaleString('pt-BR')}.
      </p>
    </section>}

    <div className="grid gap-4 lg:grid-cols-3">
      {(plans??[]).map((p:any)=>{
        const code=String(p.code);
        const plus=code==='PRO_PLUS';
        const current=billingPlan===code;

        return <section key={code} className={`arena-card relative p-6 ${plus?'border-violet-500/40 shadow-[0_0_50px_rgba(139,92,246,.08)]':''}`}>
          {plus&&<div className="absolute right-4 top-4 rounded-full bg-violet-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-violet-300">Mais completo</div>}
          <div className="arena-label">{label(code)}</div>
          <h2 className="mt-2 text-2xl font-black">{p.name}</h2>
          <p className="mt-2 min-h-12 text-sm text-slate-500">{descriptions[code]}</p>

          <div className="mt-5">
            <span className="text-3xl font-black">{formatPlanPrice(Number(p.price_cents))}</span>
            {Number(p.price_cents)>0&&<span className="text-sm text-slate-500"> / mês</span>}
          </div>

          <div className="mt-6 space-y-3 text-sm text-slate-300">
            {(bullets[code]??[]).map(item=><div key={item} className="flex gap-2"><span className="text-emerald-400">✓</span><span>{item}</span></div>)}
          </div>

          {code==='FREE'
            ? <div className={`mt-5 rounded-2xl border px-4 py-3 text-center text-sm font-black ${current?'border-emerald-500/30 bg-emerald-500/10 text-emerald-400':'border-white/10 text-slate-500'}`}>
                {current?'PLANO PAGO ATUAL':'PLANO BASE'}
              </div>
            : <UpgradeButton
                plan={code as 'PRO'|'PRO_PLUS'}
                signedIn={Boolean(ent)}
                current={billingPlan as 'FREE'|'PRO'|'PRO_PLUS'|null}
                pending={ent?.pending_upgrade??null}
              />
          }
        </section>;
      })}
    </div>

    {ent&&<section className="arena-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="arena-label">Seu acesso efetivo hoje</div>
          <h3 className="mt-1 text-xl font-black">{label(ent.plan_code)}</h3>
        </div>
        {status&&status.billing_plan_code!==ent.plan_code&&<span className="rounded-xl bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-300">Trial ativo</span>}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white/[.04] p-4"><div className="text-xs text-slate-500">Arena AI</div><b className="mt-1 block text-xl">{ent.ai_used_today}/{ent.ai_daily_limit}</b></div>
        <div className="rounded-2xl bg-white/[.04] p-4"><div className="text-xs text-slate-500">Ligas criadas</div><b className="mt-1 block text-xl">{ent.owned_leagues}/{ent.league_create_limit}</b></div>
        <div className="rounded-2xl bg-white/[.04] p-4"><div className="text-xs text-slate-500">Estatísticas avançadas</div><b className="mt-1 block text-xl">{ent.advanced_stats?'Liberadas':'PRO'}</b></div>
      </div>
    </section>}

    <PromoRedeem signedIn={Boolean(ent)}/>

    <p className="text-xs leading-5 text-slate-600">
      O checkout Stripe já está implementado e será usado automaticamente quando as credenciais e os preços externos estiverem configurados. Enquanto isso, o mesmo botão usa o fluxo manual de upgrade como fallback.
    </p>
  </div>;
}
