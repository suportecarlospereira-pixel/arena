import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getCurrentProfile} from '@/lib/data';
import {StatCard} from '@/components/stat-card';
import {SectionTitle} from '@/components/section-title';
import {SignOutButton} from '@/components/sign-out-button';
import {ProfileEditForm} from '@/components/profile-edit-form';

export const dynamic='force-dynamic';

export default async function Perfil(){
  const u=await getCurrentProfile();
  if(!u) redirect('/login');

  return <div className="space-y-5">
    <section className="arena-card p-6">
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-sky-500 text-3xl font-black text-slate-950">{(u.name||u.username||'A').slice(0,1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl font-black">{u.name}</div>
          <div className="text-sm text-slate-500">@{u.username||'usuario'} • {u.city||'-'}/{u.state||'-'}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400">Nível {u.level}</span>
            <span className="inline-flex rounded-lg bg-sky-500/10 px-2 py-1 text-xs font-bold text-sky-400">{u.plan_code}</span>
            {u.role!=='USER'&&<span className="inline-flex rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-400">{u.role}</span>}
          </div>
        </div>
        <SignOutButton/>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="XP" value={Number(u.xp).toLocaleString('pt-BR')}/>
        <StatCard label="Streak" value={`${u.current_streak} dias`}/>
        <StatCard label="Palpites" value={u.predictions}/>
        <StatCard label="Acerto" value={`${u.accuracy}%`}/>
      </div>
    </section>

    <section>
      <SectionTitle eyebrow="Atalhos" title="Sua Arena"/>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/palpites" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">🎯 Meus palpites</Link>
        <Link href="/conquistas" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">🏆 Conquistas e desafios</Link>
        <Link href="/notificacoes" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">🔔 Notificações</Link>
      </div>
    </section>

    <section>
      <SectionTitle eyebrow="Performance" title="Seu histórico"/>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Acertos" value={u.hits}/>
        <StatCard label="Placares exatos" value={u.exact}/>
        <StatCard label="Melhor streak" value={`${u.best_streak} dias`}/>
      </div>
    </section>

    <ProfileEditForm initial={{
      name:u.name||'',
      username:u.username||'',
      city:u.city||'',
      state:u.state||''
    }}/>
  </div>
}
