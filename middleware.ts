import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabase/config';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const privatePrefixes=[
  '/perfil',
  '/palpites',
  '/conquistas',
  '/notificacoes',
  '/indicacoes',
  '/admin',
];

export async function middleware(req: NextRequest) {
  let res=NextResponse.next({request:req});

  const supabase=createServerClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    cookies:{
      getAll(){return req.cookies.getAll();},
      setAll(cookiesToSet:CookieToSet[]){
        cookiesToSet.forEach(({name,value})=>req.cookies.set(name,value));
        res=NextResponse.next({request:req});
        cookiesToSet.forEach(({name,value,options})=>res.cookies.set(name,value,options));
      },
    },
  });

  try{
    await supabase.auth.getClaims();
  }catch{
    // Falha temporária do auth não derruba páginas públicas.
  }

  const hasSessionCookie=req.cookies.getAll().some(({name})=>name.startsWith('sb-'));
  const isPrivate=privatePrefixes.some(prefix=>req.nextUrl.pathname===prefix||req.nextUrl.pathname.startsWith(prefix+'/'));

  if(hasSessionCookie||isPrivate){
    res.headers.set('Cache-Control','private, no-store');
  }

  res.headers.set('X-Content-Type-Options','nosniff');
  res.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options','DENY');
  res.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');

  return res;
}

export const config={
  matcher:['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js).*)'],
};
