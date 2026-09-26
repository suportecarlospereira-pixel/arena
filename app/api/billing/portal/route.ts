import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createStripePortalSession,stripeServerConfigured} from '@/lib/billing/stripe-rest';

export const runtime='nodejs';

export async function POST(req:Request){
  try{
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({error:'Não autenticado.'},{status:401});
    }

    if(!stripeServerConfigured()){
      return NextResponse.json({error:'Portal Stripe ainda não configurado.',code:'BILLING_NOT_CONFIGURED'},{status:503});
    }

    const {data,error}=await s.rpc('get_my_billing_customer',{p_provider:'stripe'});
    if(error) throw error;

    const customerId=typeof data==='string'?data:null;
    if(!customerId){
      return NextResponse.json({error:'Esta assinatura não possui cliente Stripe vinculado.'},{status:404});
    }

    const appUrl=(process.env.NEXT_PUBLIC_APP_URL?.trim()||new URL(req.url).origin).replace(/\/$/,'');
    const session=await createStripePortalSession({customerId,appUrl});

    if(!session?.url){
      return NextResponse.json({error:'A Stripe não retornou a URL do portal.'},{status:502});
    }

    return NextResponse.json({ok:true,url:session.url});
  }catch{
    return NextResponse.json({error:'Não foi possível abrir o portal de cobrança.'},{status:500});
  }
}
