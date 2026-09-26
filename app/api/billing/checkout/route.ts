import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {createStripeCheckoutSession,stripeServerConfigured} from '@/lib/billing/stripe-rest';

export const runtime='nodejs';

const Schema=z.object({
  plan:z.enum(['PRO','PRO_PLUS'])
});

export async function POST(req:Request){
  try{
    const {plan}=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({error:'Faça login para assinar.'},{status:401});
    }

    const {data:profile}=await s.from('profiles')
      .select('plan_code')
      .eq('id',user.id)
      .single();

    await s.rpc('record_monetization_event',{
      p_event_type:'checkout_start',
      p_plan_code:plan,
      p_source:'pricing_page'
    });

    if(profile?.plan_code===plan){
      return NextResponse.json({error:'Você já está neste plano.',code:'ALREADY_ON_PLAN'},{status:409});
    }

    // Tier changes on an existing paid plan remain manual until subscription
    // item updates/proration are enabled.
    if(profile?.plan_code&&profile.plan_code!=='FREE'){
      return NextResponse.json({
        error:'A mudança entre planos pagos é processada pelo atendimento neste momento.',
        code:'MANUAL_PLAN_CHANGE'
      },{status:409});
    }

    const {data:offerData,error:offerError}=await s.rpc('get_checkout_offer',{p_plan:plan});
    if(offerError) throw offerError;

    const offer=Array.isArray(offerData)?offerData[0]:offerData;

    if(!offer||!stripeServerConfigured()){
      return NextResponse.json({
        error:'Checkout automático ainda não configurado.',
        code:'BILLING_NOT_CONFIGURED'
      },{status:503});
    }

    const {data:customerData}=await s.rpc('get_my_billing_customer',{p_provider:'stripe'});
    const customerId=typeof customerData==='string'&&customerData?customerData:null;

    const appUrl=(process.env.NEXT_PUBLIC_APP_URL?.trim()||new URL(req.url).origin).replace(/\/$/,'');
    const session=await createStripeCheckoutSession({
      priceId:String(offer.external_price_id),
      userId:user.id,
      email:user.email??null,
      customerId,
      plan,
      appUrl
    });

    if(!session?.url){
      return NextResponse.json({error:'A Stripe não retornou uma URL de checkout.'},{status:502});
    }

    return NextResponse.json({
      ok:true,
      provider:'stripe',
      url:session.url
    });
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({error:'Plano inválido.'},{status:400});
    }

    const message=e instanceof Error?e.message:'Erro interno.';
    return NextResponse.json({
      error:message==='stripe_not_configured'?'Checkout automático ainda não configurado.':'Não foi possível iniciar o checkout.'
    },{status:500});
  }
}
