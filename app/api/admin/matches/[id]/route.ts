import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Schema=z.object({
  status:z.enum(['SCHEDULED','LIVE','FINISHED','POSTPONED','CANCELLED']),
  homeScore:z.number().int().min(0).max(99).nullable(),
  awayScore:z.number().int().min(0).max(99).nullable(),
});

function mapRpcError(message:string){
  if(message.includes('forbidden')) return {status:403,error:'Acesso negado.'};
  if(message.includes('match_not_found')) return {status:404,error:'Partida não encontrada.'};
  if(message.includes('result_locked')) return {status:409,error:'Este resultado está travado. Use a revisão de resultados.'};
  if(message.includes('result_requires_review')) return {status:409,error:'Alterações de resultado final devem ser feitas em Admin → Revisão de resultados.'};
  return {status:500,error:'Não foi possível atualizar a partida.'};
}

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
      p_starts_at:null,
    });

    if(error){
      const mapped=mapRpcError(error.message||'');
      return NextResponse.json({error:mapped.error},{status:mapped.status});
    }

    return NextResponse.json({ok:true,match:data});
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({error:'Dados inválidos.'},{status:400});
    }
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}
