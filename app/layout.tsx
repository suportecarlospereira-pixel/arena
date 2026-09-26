import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: { default: 'ARENA', template: '%s | ARENA' },
  description: 'Futebol. Inteligência. Competição.',
  applicationName: 'ARENA',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ARENA' },
};

export const viewport: Viewport = { themeColor: '#05070b', colorScheme: 'dark' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><PwaRegister/><AppShell>{children}</AppShell></body>
    </html>
  );
}
