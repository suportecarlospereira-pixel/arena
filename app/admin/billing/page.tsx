import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {SectionTitle} from '@/components/section-title';
import {StatCard} from '@/components/stat-card';
import {AdminBillingRequests} from '@/components/admin-billing-requests';

export const dynamic='force-dynamic';

export default async function AdminBillingPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me||!['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const [{data:stats,error:statsError},{data:requests,error:requestsError}]=await Promise.all([
    s.rpc('admin_billing_stats'),
    s.rpc('admin_list_upgrade_requests',{p_status:null,p_limit:200})
  ]);

  if(statsError) throw statsError;
  if(requestsError) throw requestsError;

  const x=Array.isArray(stats)?stats[0]:stats;
  const mrr=Number(x?.mrr_cents??0)/100;

  return <div className="space-y-6">
    <div>
      <SectionTitle eyebrow="Monetização" title="Billing"/>
      <p className="text-sm text-slate-400">
        Fluxo manual ativo enquanto a Stripe não estiver conectada. Aprovar uma solicitação ativa o plano e registra uma assinatura manual.
      </p>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard label="Pendentes" value={x?.pending_requests??0}/>
      <StatCard label="PRO" value={x?.active_pro??0}/>
      <StatCard label="PRO+" value={x?.active_pro_plus??0}/>
      <StatCard label="Assinaturas manuais" value={x?.active_manual_subscriptions??0}/>
      <StatCard label="MRR teórico" value={mrr.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}/>
    </div>

    <section>
      <SectionTitle eyebrow="Pipeline comercial" title="Solicitações"/>
      <AdminBillingRequests initial={(requests??[]) as any[]}/>
    </section>
  </div>;
}
