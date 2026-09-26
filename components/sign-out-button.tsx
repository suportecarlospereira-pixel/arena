'use client';
import {createClient} from '@/lib/supabase/client';
export function SignOutButton(){return <button onClick={async()=>{await createClient().auth.signOut();location.href='/login'}} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-400 hover:text-white">Sair</button>}
