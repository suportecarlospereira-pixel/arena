import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Challenge=z.object({
  type:z.literal('challenge'),
  name:z.string().trim().min(2).max(120),
  description:z.string().trim().min(2).max(500),
  xpReward:z.coerce.number().int().min(0).max(100000),
  predictions:z.coerce.number().int().min(1).max(1000),
  startsAt:z.string().min(1),
  endsAt:z.string().min(1)
});

const Achievement=z.object({
  type:z.literal('achievement'),
  code:z.string().trim().min(2).max(60).regex(/^[A-Z0-9_]+$/),
  name:z.string().trim().min(2).max(120),
  description:z.string().trim().min(2).max(500),
  xpReward:z.coerce.number().int().min(0).max(100000)
});

const Schema=z.discriminatedUnion('type',[Challenge,Achievement]);

export async function POST(req:Request){
  try{
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();
    if(!user) return NextResponse.json({error:'Não autenticado.'},{status:401});

    if(input.type==='challenge'){
      const starts=new Date(input.startsAt);
      const ends=new Date(input.endsAt);
      if(Number.isNaN(starts.getTime())||Number.isNaN(ends.getTime())) return NextResponse.json({error:'Datas inválidas.'},{status:400});

      const {data,error}=await s.rpc('admin_create_challenge',{
        p_name:input.name,
        p_type:'daily',
        p_description:input.description,
        p_xp_reward:input.xpReward,
        p_predictions:input.predictions,
        p_starts_at:starts.toISOString(),
        p_ends_at:ends.toISOString()
      });
      if(error) throw error;
      return NextResponse.json({ok:true,data});
    }

    const {data,error}=await s.rpc('admin_create_achievement',{
      p_code:input.code,
      p_name:input.name,
      p_description:input.description,
      p_xp_reward:input.xpReward
    });
    if(error) throw error;
    return NextResponse.json({ok:true,data});
  }catch(e){
    if(e instanceof z.ZodError) return NextResponse.json({error:'Verifique os dados informados.'},{status:400});
    return NextResponse.json({error:e instanceof Error?e.message:'Erro interno.'},{status:500});
  }
}
