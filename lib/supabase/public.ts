import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export function createPublicClient(){
  return createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{
      persistSession:false,
      autoRefreshToken:false,
      detectSessionInUrl:false,
    },
  });
}
