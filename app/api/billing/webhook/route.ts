import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {verifyStripeSignature} from '@/lib/billing/stripe-rest';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function asString(value:any){
  return typeof value==='string'?value:null;
}

function unixToIso(value:any){
  return typeof value==='number'&&Number.isFinite(value)
    ?new Date(value*1000).toISOString()
    :null;
}

export async function POST(req:Request){
  const secret=process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if(!secret){
    return NextResponse.json({error:'Webhook não configurado.'},{status:503});
  }

  const raw=await req.text();
  const signature=req.headers.get('stripe-signature');

  if(!verifyStripeSignature(raw,signature,secret)){
    return NextResponse.json({error:'Assinatura inválida.'},{status:400});
  }

  let event:any;
  try{
    event=JSON.parse(raw);
  }catch{
    return NextResponse.json({error:'Payload inválido.'},{status:400});
  }

  const admin=createAdminClient();
  if(!admin){
    return NextResponse.json({error:'Supabase server secret não configurado.'},{status:503});
  }

  try{
    const object=event?.data?.object??{};

    if(event.type==='checkout.session.completed'){
      const userId=asString(object.client_reference_id)||asString(object.metadata?.arena_user_id);
      const customerId=asString(object.customer);

      if(userId&&customerId){
        const {error}=await admin.rpc('billing_link_stripe_customer',{
          p_user_id:userId,
          p_customer_id:customerId
        });
        if(error) throw error;
      }

      return NextResponse.json({received:true,linked:Boolean(userId&&customerId)});
    }

    if([
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted'
    ].includes(event.type)){
      const userId=asString(object.metadata?.arena_user_id);
      const customerId=asString(object.customer);
      const subscriptionId=asString(object.id);
      const priceId=asString(object.items?.data?.[0]?.price?.id);
      const status=event.type==='customer.subscription.deleted'
        ?'canceled'
        :String(object.status||'unknown');

      if(!subscriptionId){
        return NextResponse.json({error:'Subscription ausente.'},{status:400});
      }

      const {data,error}=await admin.rpc('billing_apply_stripe_subscription_event',{
        p_event_id:String(event.id),
        p_event_type:String(event.type),
        p_user_id:userId,
        p_customer_id:customerId,
        p_subscription_id:subscriptionId,
        p_price_id:priceId,
        p_status:status,
        p_period_end:unixToIso(object.current_period_end),
        p_cancel_at_period_end:Boolean(object.cancel_at_period_end),
        p_summary:{
          status,
          price_id:priceId,
          cancel_at_period_end:Boolean(object.cancel_at_period_end)
        }
      });

      if(error) throw error;

      return NextResponse.json({received:true,result:data});
    }

    return NextResponse.json({received:true,ignored:true});
  }catch(error){
    console.error('stripe_webhook_processing_failed',error);
    return NextResponse.json({error:'Falha ao processar evento.'},{status:500});
  }
}
