import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SectionTitle } from '@/components/section-title';
import { AdminResultReview } from '@/components/admin-result-review';

export const dynamic='force-dynamic';

export default async function AdminReview(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me||!['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const {data,error}=await s.rpc('admin_result_reviews');
  if(error) throw error;

  return <div className="space-y-5">
    <div>
      <SectionTitle eyebrow="Integridade" title="Revisão de resultados"/>
      <p className="text-sm leading-6 text-slate-400">
        Resultados divergentes ficam bloqueados para evitar liquidação incorreta. Um SUPER_ADMIN pode confirmar o placar oficial e travar a partida.
      </p>
    </div>
    <AdminResultReview rows={(data??[]) as any[]} isSuperAdmin={me.role==='SUPER_ADMIN'}/>
  </div>
}
