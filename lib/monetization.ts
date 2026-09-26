import {createClient} from '@/lib/supabase/server';

export type Entitlements={
  plan_code:'FREE'|'PRO'|'PRO_PLUS';
  plan_name:string;
  price_cents:number;
  ai_daily_limit:number;
  ai_used_today:number;
  ai_remaining:number;
  league_create_limit:number;
  owned_leagues:number;
  advanced_stats:boolean;
  ad_free:boolean;
  priority:boolean;
  pending_upgrade:'PRO'|'PRO_PLUS'|null;
};

export type PlanStatus={
  billing_plan_code:'FREE'|'PRO'|'PRO_PLUS';
  effective_plan_code:'FREE'|'PRO'|'PRO_PLUS';
  grant_plan_code:'PRO'|'PRO_PLUS'|null;
  grant_source:string|null;
  grant_ends_at:string|null;
};

export async function getMyEntitlements():Promise<Entitlements|null>{
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) return null;

  const {data,error}=await s.rpc('get_my_entitlements');
  if(error) throw error;

  const row=Array.isArray(data)?data[0]:data;
  return row??null;
}

export async function getMyPlanStatus():Promise<PlanStatus|null>{
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) return null;

  const {data,error}=await s.rpc('get_my_plan_status');
  if(error) throw error;

  const row=Array.isArray(data)?data[0]:data;
  return row??null;
}

export function formatPlanPrice(cents:number){
  if(!cents) return 'Grátis';
  return (cents/100).toLocaleString('pt-BR',{
    style:'currency',
    currency:'BRL'
  });
}
