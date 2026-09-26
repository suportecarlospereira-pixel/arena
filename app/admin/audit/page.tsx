import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SectionTitle } from '@/components/section-title';

export const dynamic='force-dynamic';

export default async function AuditPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');
  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me || !['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const {data,error}=await s.rpc('admin_recent_audit',{p_limit:100});
  if(error) throw error;

  return <div>
    <SectionTitle eyebrow="Segurança" title="Auditoria administrativa"/>
    <div className="arena-card overflow-hidden">
      {(data??[]).map((row:any)=><div key={row.id} className="grid gap-1 border-b border-white/5 p-4 last:border-0 sm:grid-cols-[1fr_1fr_auto]">
        <div><b>{row.action}</b><div className="text-xs text-slate-500">{row.entity_type} • {row.entity_id}</div></div>
        <div className="text-sm text-slate-400">@{row.actor_username||'sistema'}</div>
        <time className="text-xs text-slate-600">{new Date(row.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</time>
      </div>)}
      {!data?.length&&<div className="p-5 text-sm text-slate-400">Ainda não há ações administrativas registradas.</div>}
    </div>
  </div>
}
