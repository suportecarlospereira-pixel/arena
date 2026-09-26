import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SectionTitle } from '@/components/section-title';
import { AdminNotificationForm } from '@/components/admin-notification-form';

export default async function AdminNotifications() {
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');
  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me || !['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  return <div>
    <SectionTitle eyebrow="Comunicação" title="Notificações"/>
    <p className="mb-5 text-sm text-slate-400">Envie um aviso interno para todos os usuários cadastrados.</p>
    <AdminNotificationForm/>
  </div>
}
