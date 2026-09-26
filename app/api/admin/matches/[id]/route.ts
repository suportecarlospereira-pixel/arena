import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Schema=z.object({
  status:z.enum(['SCHEDULED','LIVE','FINISHED','POSTPONED','CANCELLED']),
  homeScore:z.number().int().min(0).max(99).nullable(),
  awayScore:z.number().int().min(0).max(99).nullable()
});

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();
    if(!user) return NextResponse.json({error:'Não autenticado.'},{status:401});

    const {data,error}=await s.rpc('admin_update_match',{
      p_match_id:id,
      p_status:input.status,
      p_home_score:input.homeScore,
      p_away_score:input.awayScore,
      p_starts_at:null
    });
    if(error) throw error;
    return NextResponse.json({ok:true,match:data});
  }catch(e){
    if(e instanceof z.ZodError) return NextResponse.json({error:'Dados inválidos.'},{status:400});
    return NextResponse.json({error:e instanceof Error?e.message:'Erro interno.'},{status:500});
  }
}
