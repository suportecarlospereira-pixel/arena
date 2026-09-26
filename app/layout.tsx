import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { PwaRegister } from '@/components/pwa-register';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: { default: 'ARENA', template: '%s | ARENA' },
  description: 'Futebol. Inteligência. Competição.',
  applicationName: 'ARENA',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ARENA' },
};

export const viewport: Viewport = { themeColor: '#05070b', colorScheme: 'dark' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let isAdmin=false;

  try{
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();
    if(user){
      const {data:profile}=await s.from('profiles').select('role').eq('id',user.id).maybeSingle();
      isAdmin=Boolean(profile && ['ADMIN','SUPER_ADMIN'].includes(profile.role));
    }
  }catch{
    isAdmin=false;
  }

  return (
    <html lang="pt-BR">
      <body>
        <PwaRegister/>
        <AppShell isAdmin={isAdmin}>{children}</AppShell>
      </body>
    </html>
  );
}
