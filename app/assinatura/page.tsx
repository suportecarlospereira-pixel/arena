import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {SectionTitle} from '@/components/section-title';
import {BillingPortalButton} from '@/components/billing-portal-button';

export const dynamic='force-dynamic';

function fmtDate(value:string|null|undefined){
  if(!value) return '—';
  return new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit',
    year:'numeric'
  }).format(new Date(value));
}

export default async function AssinaturaPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data,error}=await s.rpc('get_my_billing_status');
  if(error) throw error;

  const x=Array.isArray(data)?data[0]:data;
  const plan=x?.plan_code==='PRO_PLUS'?'PRO+':(x?.plan_code??'FREE');
  const provider=x?.provider??null;
  const status=x?.subscription_status??null;

  return <div className="mx-auto max-w-3xl space-y-6">
    <div>
      <SectionTitle eyebrow="Conta" title="Assinatura"/>
      <p className="text-sm text-slate-400">Veja seu plano atual e o estado da cobrança.</p>
    </div>

    <section className="arena-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="arena-label">Plano atual</div>
          <div className="mt-2 text-4xl font-black">{plan}</div>
          <div className="mt-2 text-sm text-slate-500">
            {provider
              ?'Cobrança: '+provider+(status?' • '+status:'')
              :'Sem assinatura de cobrança ativa.'}
          </div>
        </div>

        <Link href="/planos" className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-slate-300">
          VER PLANOS
        </Link>
      </div>

      {provider&&<div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/[.04] p-4">
          <div className="text-xs text-slate-500">Período atual até</div>
          <b className="mt-1 block">{fmtDate(x?.current_period_end)}</b>
        </div>
        <div className="rounded-2xl bg-white/[.04] p-4">
          <div className="text-xs text-slate-500">Cancelamento</div>
          <b className="mt-1 block">
            {x?.cancel_at_period_end?'Agendado para o fim do período':'Não agendado'}
          </b>
        </div>
      </div>}

      <div className="mt-6">
        {provider==='stripe'&&x?.external_customer_exists
          ?<BillingPortalButton/>
          :provider==='manual'
            ?<p className="text-sm leading-6 text-slate-400">Sua assinatura atual é administrada manualmente pelo ARENA. Alterações ficam disponíveis pelo painel comercial.</p>
            :plan==='FREE'
              ?<Link href="/planos" className="arena-button inline-flex">CONHECER PRO</Link>
              :null}
      </div>
    </section>

    <section className="arena-card p-5">
      <div className="arena-label">Segurança da cobrança</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Dados de cartão não são armazenados no ARENA. Quando a Stripe estiver ativa, checkout e gerenciamento financeiro acontecem no ambiente seguro do provedor.
      </p>
    </section>
  </div>;
}
