import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {SectionTitle} from '@/components/section-title';
import {StatCard} from '@/components/stat-card';

export const dynamic='force-dynamic';

function row(data:any){
  return Array.isArray(data)?data[0]:data;
}

function pct(value:any){
  return Number(value??0).toLocaleString('pt-BR',{
    minimumFractionDigits:0,
    maximumFractionDigits:2
  })+'%';
}

export default async function AdminGrowthPage({
  searchParams
}:{
  searchParams:Promise<{days?:string}>
}){
  const params=await searchParams;
  const requested=Number(params.days??30);
  const days=[7,30,90].includes(requested)?requested:30;

  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me||!['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const [
    {data:funnel,error:funnelError},
    {data:plans,error:plansError}
  ]=await Promise.all([
    s.rpc('admin_monetization_funnel',{p_days:days}),
    s.rpc('admin_monetization_by_plan',{p_days:days})
  ]);

  if(funnelError) throw funnelError;
  if(plansError) throw plansError;

  const x=row(funnel)??{};

  return <div className="space-y-7">
    <div>
      <SectionTitle eyebrow="Monetização" title="Funil de conversão"/>
      <p className="max-w-2xl text-sm leading-6 text-slate-400">
        Métricas agregadas de usuários autenticados. O ARENA não usa rastreamento anônimo neste funil.
      </p>
    </div>

    <div className="flex gap-2">
      {[7,30,90].map(n=><Link
        key={n}
        href={'/admin/growth?days='+n}
        className={days===n
          ?'rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950'
          :'rounded-xl border border-white/10 px-4 py-2 text-xs font-black text-slate-400'}
      >{n} DIAS</Link>)}
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Viram planos" value={x.pricing_view_users??0}/>
      <StatCard label="Iniciaram checkout" value={x.checkout_start_users??0}/>
      <StatCard label="Ativações" value={x.subscription_active_users??0}/>
      <StatCard label="Cancelamentos" value={x.subscription_cancelled_users??0}/>
    </div>

    <section className="grid gap-3 md:grid-cols-2">
      <div className="arena-card p-5">
        <div className="arena-label">Conversão do checkout</div>
        <div className="mt-2 text-4xl font-black text-emerald-400">{pct(x.checkout_conversion_pct)}</div>
        <p className="mt-2 text-xs text-slate-500">Usuários que ativaram premium entre os que iniciaram checkout no período.</p>
      </div>
      <div className="arena-card p-5">
        <div className="arena-label">Conversão da página de planos</div>
        <div className="mt-2 text-4xl font-black text-sky-400">{pct(x.overall_conversion_pct)}</div>
        <p className="mt-2 text-xs text-slate-500">Ativações premium em relação a usuários autenticados que visualizaram os planos.</p>
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard label="Pedidos manuais" value={x.manual_request_users??0}/>
      <StatCard label="Resgataram trial/cupom" value={x.promo_redeem_users??0}/>
    </div>

    <section>
      <SectionTitle eyebrow="Por produto" title="PRO x PRO+"/>
      <div className="arena-card overflow-x-auto">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="p-4">Plano</th>
              <th>Visualizações</th>
              <th>Checkout</th>
              <th>Manual</th>
              <th>Trials</th>
              <th className="pr-4">Ativações</th>
            </tr>
          </thead>
          <tbody>
            {(plans??[]).map((p:any)=><tr key={p.plan_code} className="border-b border-white/5 last:border-0">
              <td className="p-4 font-black text-violet-300">{p.plan_code==='PRO_PLUS'?'PRO+':p.plan_code}</td>
              <td>{p.pricing_views}</td>
              <td>{p.checkout_starts}</td>
              <td>{p.manual_requests}</td>
              <td>{p.promo_redeems}</td>
              <td className="pr-4 font-black text-emerald-400">{p.activations}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <p className="text-xs leading-5 text-slate-600">
      Visualização e início de checkout são deduplicados por usuário/plano/dia. Ativações e cancelamentos vêm de mudanças reais em assinaturas.
    </p>
  </div>;
}
