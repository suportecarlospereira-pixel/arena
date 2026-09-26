import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Schema=z.object({
  role:z.enum(['USER','MODERATOR','ADMIN','SUPER_ADMIN']).optional(),
  plan:z.enum(['FREE','PRO','PRO_PLUS']).optional()
}).refine(v=>v.role||v.plan,{message:'Nenhuma alteração informada.'});

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params;
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();
    if(!user) return NextResponse.json({error:'Não autenticado.'},{status:401});

    let updated:any=null;

    if(input.role){
      const {data,error}=await s.rpc('admin_set_user_role',{p_user_id:id,p_role:input.role});
      if(error) throw error;
      updated=data;
    }

    if(input.plan){
      const {data,error}=await s.rpc('admin_set_user_plan',{p_user_id:id,p_plan:input.plan});
      if(error) throw error;
      updated=data;
    }

    return NextResponse.json({ok:true,user:updated});
  } catch(e) {
    if(e instanceof z.ZodError) return NextResponse.json({error:'Dados inválidos.'},{status:400});
    return NextResponse.json({error:e instanceof Error?e.message:'Erro interno.'},{status:500});
  }
}
