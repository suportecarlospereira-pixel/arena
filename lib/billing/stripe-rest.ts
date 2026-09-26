import {createHmac,timingSafeEqual} from 'node:crypto';

const STRIPE_API='https://api.stripe.com/v1';

export function stripeServerConfigured(){
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function stripeWebhookConfigured(){
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function billingAdminConfigured(){
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    (process.env.SUPABASE_SECRET_KEY?.trim()||process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  );
}

function secretKey(){
  const key=process.env.STRIPE_SECRET_KEY?.trim();
  if(!key) throw new Error('stripe_not_configured');
  return key;
}

async function stripePost(path:string,params:URLSearchParams){
  const r=await fetch(STRIPE_API+path,{
    method:'POST',
    headers:{
      Authorization:'Bearer '+secretKey(),
      'Content-Type':'application/x-www-form-urlencoded'
    },
    body:params.toString(),
    cache:'no-store'
  });

  const data=await r.json().catch(()=>({}));

  if(!r.ok){
    const message=(data as any)?.error?.message||'stripe_request_failed';
    throw new Error(message);
  }

  return data as any;
}

export async function createStripeCheckoutSession(input:{
  priceId:string;
  userId:string;
  email:string|null;
  customerId:string|null;
  plan:'PRO'|'PRO_PLUS';
  appUrl:string;
}){
  const p=new URLSearchParams();
  p.set('mode','subscription');
  p.set('success_url',input.appUrl+'/assinatura?checkout=success');
  p.set('cancel_url',input.appUrl+'/planos?checkout=cancelled');
  p.set('client_reference_id',input.userId);
  p.set('line_items[0][price]',input.priceId);
  p.set('line_items[0][quantity]','1');
  p.set('allow_promotion_codes','true');
  p.set('metadata[arena_user_id]',input.userId);
  p.set('metadata[arena_plan]',input.plan);
  p.set('subscription_data[metadata][arena_user_id]',input.userId);
  p.set('subscription_data[metadata][arena_plan]',input.plan);

  if(input.customerId){
    p.set('customer',input.customerId);
  }else if(input.email){
    p.set('customer_email',input.email);
  }

  return stripePost('/checkout/sessions',p);
}

export async function createStripePortalSession(input:{
  customerId:string;
  appUrl:string;
}){
  const p=new URLSearchParams();
  p.set('customer',input.customerId);
  p.set('return_url',input.appUrl+'/assinatura');
  return stripePost('/billing_portal/sessions',p);
}

export function verifyStripeSignature(
  rawBody:string,
  signatureHeader:string|null,
  webhookSecret:string,
  toleranceSeconds=300
){
  if(!signatureHeader||!webhookSecret) return false;

  const values:Record<string,string[]>={};
  for(const part of signatureHeader.split(',')){
    const [key,...rest]=part.trim().split('=');
    const value=rest.join('=');
    if(!key||!value) continue;
    (values[key]??=[]).push(value);
  }

  const timestamp=Number(values.t?.[0]);
  const signatures=values.v1??[];

  if(!Number.isFinite(timestamp)||!signatures.length) return false;

  const age=Math.abs(Math.floor(Date.now()/1000)-timestamp);
  if(age>toleranceSeconds) return false;

  const expected=createHmac('sha256',webhookSecret)
    .update(timestamp+'.'+rawBody,'utf8')
    .digest('hex');

  const expectedBuffer=Buffer.from(expected,'utf8');

  return signatures.some(signature=>{
    const candidate=Buffer.from(signature,'utf8');
    return candidate.length===expectedBuffer.length &&
      timingSafeEqual(candidate,expectedBuffer);
  });
}
