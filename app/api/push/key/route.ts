import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';

export async function GET(){
  const s=await createClient();
  const {data,error}=await s.rpc('get_push_public_key');
  if(error||!data) return NextResponse.json({error:'Push indisponível.'},{status:503});
  return NextResponse.json({publicKey:data},{headers:{'Cache-Control':'public, max-age=3600'}});
}
