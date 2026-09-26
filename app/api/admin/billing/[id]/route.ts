import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const Schema=z.object({
  approve:z.boolean(),
  note:z.string().trim().max(500).optional()
});

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({error:'Não autenticado.'},{status:401});
    }

    const {data,error}=await s.rpc('admin_resolve_upgrade_request',{
      p_request_id:id,
      p_approve:input.approve,
      p_note:input.note||null
    });

    if(error){
      const m=error.message||'';
      if(m.includes('forbidden')) return NextResponse.json({error:'Acesso negado.'},{status:403});
      if(m.includes('request_not_found')) return NextResponse.json({error:'Solicitação não encontrada.'},{status:404});
      if(m.includes('request_already_resolved')) return NextResponse.json({error:'Essa solicitação já foi concluída.'},{status:409});
      return NextResponse.json({error:'Não foi possível processar a solicitação.'},{status:500});
    }

    return NextResponse.json({ok:true,result:data});
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({error:'Dados inválidos.'},{status:400});
    }
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}
