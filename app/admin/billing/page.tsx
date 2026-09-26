import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {SectionTitle} from '@/components/section-title';
import {StatCard} from '@/components/stat-card';
import {AdminBillingRequests} from '@/components/admin-billing-requests';
import {billingAdminConfigured,stripeServerConfigured,stripeWebhookConfigured} from '@/lib/billing/stripe-rest';

export const dynamic='force-dynamic';

export default async function AdminBillingPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me||!['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const [
    {data:stats,error:statsError},
    {data:requests,error:requestsError},
    {data:proOffer},
    {data:plusOffer}
  ]=await Promise.all([
    s.rpc('admin_billing_stats'),
    s.rpc('admin_list_upgrade_requests',{p_status:null,p_limit:200}),
    s.rpc('get_checkout_offer',{p_plan:'PRO'}),
    s.rpc('get_checkout_offer',{p_plan:'PRO_PLUS'})
  ]);

  if(statsError) throw statsError;
  if(requestsError) throw requestsError;

  const x=Array.isArray(stats)?stats[0]:stats;
  const mrr=Number(x?.mrr_cents??0)/100;
  const catalogReady=Boolean(
    (Array.isArray(proOffer)?proOffer[0]:proOffer) &&
    (Array.isArray(plusOffer)?plusOffer[0]:plusOffer)
  );
  const secretsReady=stripeServerConfigured()&&stripeWebhookConfigured()&&billingAdminConfigured();
  const stripeReady=catalogReady&&secretsReady;

  return <div className="space-y-6">
    <div>
      <SectionTitle eyebrow="Monetização" title="Billing"/>
      <p className="text-sm text-slate-400">
        O fluxo manual permanece ativo como fallback. Quando catálogo e secrets Stripe estiverem configurados, novas assinaturas FREE → PRO/PRO+ usam checkout automático.
      </p>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard label="Pendentes" value={x?.pending_requests??0}/>
      <StatCard label="PRO" value={x?.active_pro??0}/>
      <StatCard label="PRO+" value={x?.active_pro_plus??0}/>
      <StatCard label="Assinaturas manuais" value={x?.active_manual_subscriptions??0}/>
      <StatCard label="MRR teórico" value={mrr.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}/>
    </div>

    <section className={`arena-card border p-5 ${stripeReady?'border-emerald-500/30':'border-amber-500/20'}`}>
      <div className="arena-label">Stripe</div>
      <h3 className="mt-1 text-xl font-black">{stripeReady?'Automação pronta':'Aguardando configuração externa'}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Status label="Secret do servidor" ok={stripeServerConfigured()}/>
        <Status label="Webhook secret" ok={stripeWebhookConfigured()}/>
        <Status label="Preços PRO / PRO+" ok={catalogReady}/>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Nenhum secret é exibido nesta tela. O status informa apenas se a configuração necessária existe.
      </p>
    </section>

    <section>
      <SectionTitle eyebrow="Pipeline comercial" title="Solicitações"/>
      <AdminBillingRequests initial={(requests??[]) as any[]}/>
    </section>
  </div>;
}

function Status({label,ok}:{label:string;ok:boolean}){
  return <div className="rounded-2xl bg-white/[.04] p-4">
    <div className="text-xs text-slate-500">{label}</div>
    <b className={ok?'mt-1 block text-emerald-400':'mt-1 block text-amber-400'}>
      {ok?'OK':'PENDENTE'}
    </b>
  </div>;
}
