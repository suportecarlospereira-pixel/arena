import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMatches } from '@/lib/data';
import { SectionTitle } from '@/components/section-title';
import { AdminMatchTable } from '@/components/admin-match-table';

export const dynamic='force-dynamic';

export default async function AdminMatches(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');
  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me || !['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const matches=await getMatches(100);

  return <div>
    <SectionTitle eyebrow="Operação" title="Partidas"/>
    <p className="mb-5 text-sm text-slate-400">A agenda é sincronizada automaticamente, mas o admin pode corrigir status/placar quando necessário.</p>
    <AdminMatchTable initial={matches}/>
  </div>
}
