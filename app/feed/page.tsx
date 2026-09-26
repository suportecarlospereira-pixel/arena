import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {SectionTitle} from '@/components/section-title';
import {ActivityList} from '@/components/activity-list';
export const dynamic='force-dynamic';
export default async function FeedPage(){const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect('/login');const {data,error}=await s.rpc('get_social_feed',{p_limit:80});if(error)throw error;return <div><SectionTitle eyebrow="Comunidade" title="Feed"/><p className="mb-5 text-sm text-slate-400">Atividades suas e dos jogadores que você segue.</p><ActivityList rows={(data??[]) as any[]} showUser/></div>}