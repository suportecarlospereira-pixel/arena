import Link from 'next/link';
import {redirect} from 'next/navigation';
import {Users,Activity,Trophy,ShieldCheck,Bell,ScrollText,HeartPulse,TriangleAlert,CreditCard,Megaphone,TicketPercent,TrendingUp} from 'lucide-react';
import {SectionTitle} from '@/components/section-title';
import {StatCard} from '@/components/stat-card';
import {createClient} from '@/lib/supabase/server';

export const dynamic='force-dynamic';

export default async function Admin(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data:me}=await s.from('profiles').select('role,username').eq('id',user.id).single();
  if(!me||!['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const [
    {data:stats,error:statsError},
    {data:health},
    {data:billing}
  ]=await Promise.all([
    s.rpc('admin_dashboard_stats'),
    s.rpc('admin_system_health'),
    s.rpc('admin_billing_stats')
  ]);

  if(statsError) throw statsError;

  const row=Array.isArray(stats)?stats[0]:stats;
  const h=Array.isArray(health)?health[0]:health;
  const b=Array.isArray(billing)?billing[0]:billing;

  const reviewCount=Number(h?.finished_unconfirmed??0)+Number(h?.disputed_results??0);
  const billingPending=Number(b?.pending_requests??0);

  const cards=[
    ['/admin/users',Users,'Usuários','Roles, planos e perfis'],
    ['/admin/billing',CreditCard,'Billing',billingPending?billingPending+' upgrade(s) pendente(s)':'Planos, MRR e upgrades'],
    ['/admin/sponsors',Megaphone,'Patrocínios','Campanhas, impressões, cliques e CTR'],
    ['/admin/promos',TicketPercent,'Cupons e trials','Benefícios temporários PRO/PRO+'],\n    ['/admin/growth',TrendingUp,'Conversão','Funil de planos, checkout e premium'],
    ['/admin/matches',Activity,'Partidas','Agenda, status e resultados'],
    ['/admin/review',TriangleAlert,'Revisão de resultados',reviewCount?reviewCount+' item(ns) aguardando':'Nenhuma pendência'],
    ['/admin/gamification',Trophy,'Gamificação','Conquistas e desafios'],
    ['/admin/notifications',Bell,'Notificações','Avisos para usuários'],
    ['/admin/audit',ScrollText,'Auditoria','Histórico administrativo'],
    ['/admin/system',HeartPulse,'Saúde do sistema','Provider, filas e resultados'],
  ] as const;

  return <div className="space-y-6">
    <SectionTitle eyebrow={me.role+' • @'+me.username} title="Admin Dashboard"/>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Usuários" value={row?.users??0}/>
      <StatCard label="Partidas" value={row?.matches??0}/>
      <StatCard label="Palpites" value={row?.predictions??0}/>
      <StatCard label="Premium" value={row?.premium??0}/>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(([href,Icon,title,desc])=><Link key={href} href={href} className="arena-card flex items-center gap-4 p-5 transition hover:border-emerald-500/30">
        <span className="rounded-2xl bg-white/[.05] p-3 text-emerald-400"><Icon/></span>
        <span><b className="block">{title}</b><small className="text-slate-500">{desc}</small></span>
      </Link>)}
      <div className="arena-card flex items-center gap-4 p-5">
        <span className="rounded-2xl bg-white/[.05] p-3 text-sky-400"><ShieldCheck/></span>
        <span><b className="block">Segurança ativa</b><small className="text-slate-500">RLS + RBAC + auditoria</small></span>
      </div>
    </div>
  </div>;
}
