import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SectionTitle } from '@/components/section-title';
import { AdminGamificationForm } from '@/components/admin-gamification-form';

export const dynamic='force-dynamic';

export default async function AdminGamification(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');
  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me || !['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const [{data:achievements},{data:challenges}]=await Promise.all([
    s.from('achievements').select('*').order('created_at',{ascending:false}),
    s.from('challenges').select('*').order('created_at',{ascending:false})
  ]);

  return <div className="space-y-7">
    <div>
      <SectionTitle eyebrow="Administração" title="Gamificação"/>
      <p className="text-sm text-slate-400">Crie desafios e conquistas sem editar o banco manualmente.</p>
    </div>

    <AdminGamificationForm/>

    <section>
      <SectionTitle eyebrow="Catálogo" title="Conquistas"/>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(achievements??[]).map((a:any)=><div key={a.id} className="arena-card p-4">
          <b>{a.name}</b><div className="mt-1 text-xs text-slate-500">{a.code}</div>
          <p className="mt-2 text-sm text-slate-400">{a.description}</p>
          <div className="mt-3 text-xs font-bold text-emerald-400">+{a.xp_reward} XP</div>
        </div>)}
      </div>
    </section>

    <section>
      <SectionTitle eyebrow="Ativos e históricos" title="Desafios"/>
      <div className="space-y-3">
        {(challenges??[]).map((c:any)=><div key={c.id} className="arena-card p-4">
          <div className="flex items-start justify-between gap-3"><div><b>{c.name}</b><p className="mt-1 text-sm text-slate-500">{c.description}</p></div><span className="text-xs font-bold text-emerald-400">+{c.xp_reward} XP</span></div>
          <div className="mt-3 text-xs text-slate-600">{new Date(c.starts_at).toLocaleString('pt-BR')} → {new Date(c.ends_at).toLocaleString('pt-BR')}</div>
        </div>)}
      </div>
    </section>
  </div>
}
