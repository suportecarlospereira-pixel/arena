import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const Schema=z.object({
  code:z.string().trim().min(4).max(32).regex(/^[A-Za-z0-9_-]+$/)
});

export async function POST(req:Request){
  try{
    const {code}=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({error:'Faça login para resgatar.'},{status:401});
    }

    const {data,error}=await s.rpc('redeem_promo_code',{p_code:code});

    if(error){
      const m=error.message||'';
      const map:Record<string,[string,number]>={
        promo_not_found:['Código não encontrado.',404],
        promo_inactive:['Este código está desativado.',409],
        promo_not_started:['Esta promoção ainda não começou.',409],
        promo_expired:['Este código expirou.',410],
        promo_already_redeemed:['Você já resgatou este código.',409],
        promo_limit_reached:['O limite de resgates deste código foi atingido.',409],
        already_on_equal_or_higher_plan:['Seu plano atual já possui benefícios iguais ou superiores.',409]
      };

      const hit=Object.entries(map).find(([key])=>m.includes(key));
      if(hit){
        return NextResponse.json({error:hit[1][0]},{status:hit[1][1]});
      }

      return NextResponse.json({error:'Não foi possível resgatar este código.'},{status:500});
    }

    return NextResponse.json(data);
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({error:'Código inválido.'},{status:400});
    }
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}
