import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const Schema=z.discriminatedUnion('action',[
  z.object({
    action:z.literal('create'),
    code:z.string().trim().min(4).max(32).regex(/^[A-Za-z0-9_-]+$/),
    name:z.string().trim().min(2).max(120),
    plan:z.enum(['PRO','PRO_PLUS']),
    days:z.number().int().min(1).max(90),
    maxRedemptions:z.number().int().min(1).nullable(),
    startsAt:z.string().nullable(),
    endsAt:z.string().nullable()
  }),
  z.object({
    action:z.literal('toggle'),
    promoId:z.string().uuid(),
    active:z.boolean()
  })
]);

export async function POST(req:Request){
  try{
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({error:'Não autenticado.'},{status:401});
    }

    if(input.action==='toggle'){
      const {error}=await s.rpc('admin_set_promo_active',{
        p_promo_id:input.promoId,
        p_active:input.active
      });

      if(error){
        const status=(error.message||'').includes('forbidden')?403:500;
        return NextResponse.json({error:status===403?'Acesso negado.':'Não foi possível atualizar.'},{status});
      }

      return NextResponse.json({ok:true});
    }

    const starts=input.startsAt?new Date(input.startsAt):new Date();
    const ends=input.endsAt?new Date(input.endsAt):null;

    if(Number.isNaN(starts.getTime())||(ends&&Number.isNaN(ends.getTime()))){
      return NextResponse.json({error:'Datas inválidas.'},{status:400});
    }

    if(ends&&ends<=starts){
      return NextResponse.json({error:'O fim deve ser posterior ao início.'},{status:400});
    }

    const {data,error}=await s.rpc('admin_create_promo_code',{
      p_code:input.code,
      p_name:input.name,
      p_plan:input.plan,
      p_days:input.days,
      p_max_redemptions:input.maxRedemptions,
      p_starts_at:starts.toISOString(),
      p_ends_at:ends?ends.toISOString():null
    });

    if(error){
      const m=error.message||'';
      if(m.includes('forbidden')) return NextResponse.json({error:'Acesso negado.'},{status:403});
      if(m.includes('duplicate key')) return NextResponse.json({error:'Já existe um cupom com este código.'},{status:409});
      return NextResponse.json({error:'Não foi possível criar o cupom.'},{status:500});
    }

    return NextResponse.json({ok:true,id:data});
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({error:'Verifique os dados do cupom.'},{status:400});
    }
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}
