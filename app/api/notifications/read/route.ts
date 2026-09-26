import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) return NextResponse.json({error:'Não autenticado.'},{status:401});

  const {error}=await s.from('notifications')
    .update({read_at:new Date().toISOString()})
    .eq('user_id',user.id)
    .is('read_at',null);

  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true});
}
