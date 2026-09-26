import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const Save=z.object({
  endpoint:z.string().url().max(2048),
  p256dh:z.string().min(20).max(512),
  auth:z.string().min(10).max(512)
});
const Remove=z.object({endpoint:z.string().url().max(2048)});

export async function POST(req:Request){
  try{
    const input=Save.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();
    if(!user) return NextResponse.json({error:'Não autenticado.'},{status:401});

    const {data,error}=await s.rpc('save_push_subscription',{
      p_endpoint:input.endpoint,
      p_p256dh:input.p256dh,
      p_auth:input.auth,
      p_user_agent:req.headers.get('user-agent')||null
    });
    if(error) return NextResponse.json({error:'Não foi possível salvar a subscription.'},{status:500});
    return NextResponse.json({ok:true,id:data});
  }catch(e){
    if(e instanceof z.ZodError) return NextResponse.json({error:'Subscription inválida.'},{status:400});
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}

export async function DELETE(req:Request){
  try{
    const input=Remove.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();
    if(!user) return NextResponse.json({error:'Não autenticado.'},{status:401});
    const {error}=await s.rpc('remove_push_subscription',{p_endpoint:input.endpoint});
    if(error) return NextResponse.json({error:'Não foi possível remover a subscription.'},{status:500});
    return NextResponse.json({ok:true});
  }catch(e){
    if(e instanceof z.ZodError) return NextResponse.json({error:'Subscription inválida.'},{status:400});
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}
