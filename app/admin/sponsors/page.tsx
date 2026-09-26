import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {SectionTitle} from '@/components/section-title';
import {AdminSponsors} from '@/components/admin-sponsors';

export const dynamic='force-dynamic';

export default async function AdminSponsorsPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me||!['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const {data,error}=await s.rpc('admin_list_sponsor_campaigns',{p_limit:200});
  if(error) throw error;

  return <div className="space-y-6">
    <div>
      <SectionTitle eyebrow="Receita publicitária" title="Patrocínios"/>
      <p className="text-sm leading-6 text-slate-400">
        Campanhas aparecem apenas para usuários FREE elegíveis. PRO/PRO+ permanecem sem espaços patrocinados.
      </p>
    </div>

    <AdminSponsors initial={(data??[]) as any[]}/>
  </div>;
}
