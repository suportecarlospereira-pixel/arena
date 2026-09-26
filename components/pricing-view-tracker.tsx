'use client';

import {useEffect} from 'react';
import {createClient} from '@/lib/supabase/client';

export function PricingViewTracker({enabled}:{enabled:boolean}){
  useEffect(()=>{
    if(!enabled) return;

    const s=createClient();

    Promise.all([
      s.rpc('record_monetization_event',{
        p_event_type:'pricing_view',
        p_plan_code:'PRO',
        p_source:'pricing_page'
      }),
      s.rpc('record_monetization_event',{
        p_event_type:'pricing_view',
        p_plan_code:'PRO_PLUS',
        p_source:'pricing_page'
      })
    ]).catch(()=>{});
  },[enabled]);

  return null;
}
