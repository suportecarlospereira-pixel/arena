import {createClient as createSupabaseClient} from '@supabase/supabase-js';

export function createAdminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key=(
    process.env.SUPABASE_SECRET_KEY?.trim()||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );

  if(!url||!key) return null;

  return createSupabaseClient(url,key,{
    auth:{
      persistSession:false,
      autoRefreshToken:false,
      detectSessionInUrl:false
    }
  });
}
