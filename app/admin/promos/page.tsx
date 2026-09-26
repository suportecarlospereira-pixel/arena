import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {SectionTitle} from '@/components/section-title';
import {AdminPromos} from '@/components/admin-promos';

export const dynamic='force-dynamic';

export default async function AdminPromosPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me||!['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const {data,error}=await s.rpc('admin_list_promo_codes',{p_limit:200});
  if(error) throw error;

  return <div className="space-y-6">
    <div>
      <SectionTitle eyebrow="Aquisição e retenção" title="Cupons e trials"/>
      <p className="text-sm leading-6 text-slate-400">
        Libere PRO ou PRO+ temporariamente sem alterar a assinatura real do usuário. Ao expirar, o benefício some automaticamente.
      </p>
    </div>

    <AdminPromos initial={(data??[]) as any[]}/>
  </div>;
}
