import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Schema=z.object({
  homeScore:z.number().int().min(0).max(99),
  awayScore:z.number().int().min(0).max(99),
});

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const input=Schema.parse(await req.json());
    const s=await createClient();

    const {data:{user}}=await s.auth.getUser();
    if(!user) return NextResponse.json({error:'Não autenticado.'},{status:401});

    const {data,error}=await s.rpc('admin_resolve_match_result',{
      p_match_id:id,
      p_home_score:input.homeScore,
      p_away_score:input.awayScore,
    });

    if(error){
      const message=error.message||'';
      const status=message.includes('forbidden')?403:message.includes('match_not_found')?404:500;
      const body=status===403?'Acesso negado.':status===404?'Partida não encontrada.':'Não foi possível resolver o resultado.';
      return NextResponse.json({error:body},{status});
    }

    return NextResponse.json({ok:true,match:data});
  }catch(e){
    if(e instanceof z.ZodError) return NextResponse.json({error:'Placar inválido.'},{status:400});
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}
