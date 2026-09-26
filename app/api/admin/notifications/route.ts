import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Schema=z.object({
  title:z.string().trim().min(2).max(120),
  body:z.string().trim().min(2).max(1000)
});

export async function POST(req:Request){
  try{
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();
    if(!user) return NextResponse.json({error:'Não autenticado.'},{status:401});

    const {data,error}=await s.rpc('admin_create_notification',{
      p_title:input.title,p_body:input.body,p_type:'admin',p_user_id:null
    });
    if(error) throw error;
    return NextResponse.json({ok:true,recipients:data??0});
  }catch(e){
    if(e instanceof z.ZodError) return NextResponse.json({error:'Dados inválidos.'},{status:400});
    return NextResponse.json({error:e instanceof Error?e.message:'Erro interno.'},{status:500});
  }
}
