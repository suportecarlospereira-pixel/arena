'use client';
import { Home, Trophy, Bot, UserRound, CirclePlay, Shield } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Logo } from './logo';
import { cn } from '@/lib/utils';
const nav=[['/','Home',Home],['/jogos','Jogos',CirclePlay],['/ranking','Ranking',Trophy],['/arena-ai','Arena AI',Bot],['/perfil','Perfil',UserRound]] as const;
export function AppShell({children}:{children:React.ReactNode}){
 const path=usePathname(); const auth=path==='/login'||path==='/register';
 if(auth) return <>{children}</>;
 return <div className="min-h-screen pb-24 lg:pb-8">
   <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05070b]/80 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3"><Logo/><Link href="/admin" className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-400 hover:text-white"><Shield size={15}/>Admin</Link></div></header>
   <div className="mx-auto flex max-w-7xl gap-6 px-4 lg:px-6">
    <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-56 shrink-0 pt-6 lg:block"><nav className="space-y-2">{nav.map(([href,label,Icon])=><Link key={href} href={href} className={cn('flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition',path===href?'bg-emerald-500 text-slate-950':'text-slate-400 hover:bg-white/[.06] hover:text-white')}><Icon size={19}/>{label}</Link>)}</nav></aside>
    <main className="min-w-0 flex-1 py-5 lg:py-8">{children}</main>
   </div>
   <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-3xl border border-white/10 bg-[#0b0e14]/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl lg:hidden">{nav.map(([href,label,Icon])=><Link key={href} href={href} className={cn('flex flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-bold',path===href?'bg-emerald-500 text-slate-950':'text-slate-400')}><Icon size={19}/><span>{label}</span></Link>)}</nav>
 </div>
}
