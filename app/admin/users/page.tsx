import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SectionTitle } from '@/components/section-title';
import { AdminUserTable } from '@/components/admin-user-table';

export const dynamic='force-dynamic';

export default async function AdminUsers() {
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me || !['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const {data,error}=await s.rpc('admin_list_users',{p_search:null,p_limit:100,p_offset:0});
  if(error) throw error;

  return <div className="space-y-5">
    <SectionTitle eyebrow="Administração" title="Usuários e acessos"/>
    <p className="text-sm text-slate-400">Gerencie roles e planos. Alterações administrativas ficam registradas na auditoria.</p>
    <AdminUserTable initialRows={(data??[]) as any[]} currentUserId={user.id}/>
  </div>
}
