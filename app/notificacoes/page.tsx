import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {SectionTitle} from '@/components/section-title';
import {NotificationsList} from '@/components/notifications-list';
import {PushSettings} from '@/components/push-settings';

export const dynamic='force-dynamic';

export default async function NotificationsPage(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data,error}=await s.from('notifications')
    .select('id,title,body,type,read_at,created_at')
    .eq('user_id',user.id)
    .order('created_at',{ascending:false})
    .limit(100);

  if(error) throw error;

  return <div>
    <SectionTitle eyebrow="Central" title="Notificações"/>
    <PushSettings/>
    <NotificationsList initial={(data??[]) as any[]}/>
  </div>
}
