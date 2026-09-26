import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const Schema=z.object({
  plan:z.enum(['PRO','PRO_PLUS'])
});

export async function POST(req:Request){
  try{
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({error:'Faça login para solicitar o upgrade.'},{status:401});
    }

    const {data,error}=await s.rpc('request_plan_upgrade',{
      p_plan:input.plan,
      p_source:'pricing_page'
    });

    if(error){
      const m=error.message||'';
      if(m.includes('already_on_plan')){
        return NextResponse.json({error:'Você já está neste plano.'},{status:409});
      }
      return NextResponse.json({error:'Não foi possível registrar a solicitação.'},{status:500});
    }

    return NextResponse.json({ok:true,id:data});
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({error:'Plano inválido.'},{status:400});
    }
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}
