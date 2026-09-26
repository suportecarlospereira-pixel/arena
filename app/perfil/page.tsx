import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getCurrentProfile} from '@/lib/data';
import {createClient} from '@/lib/supabase/server';
import {StatCard} from '@/components/stat-card';
import {SectionTitle} from '@/components/section-title';
import {SignOutButton} from '@/components/sign-out-button';
import {ProfileEditForm} from '@/components/profile-edit-form';

export const dynamic='force-dynamic';

export default async function Perfil(){
  const [u,s]=await Promise.all([getCurrentProfile(),createClient()]);
  if(!u) redirect('/login');

  const {data:teams}=await s.from('teams').select('id,name').eq('country','Brasil').order('name');
  const planLabel=u.plan_code==='PRO_PLUS'?'PRO+':u.plan_code;

  return <div className="space-y-5">
    <section className="arena-card p-6">
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-sky-500 text-3xl font-black text-slate-950">
          {(u.name||u.username||'A').slice(0,1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl font-black">{u.name}</div>
          <div className="text-sm text-slate-500">@{u.username||'usuario'} • {u.city||'-'}/{u.state||'-'}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400">Nível {u.level}</span>
            <Link href="/planos" className="inline-flex rounded-lg bg-sky-500/10 px-2 py-1 text-xs font-bold text-sky-400">{planLabel}</Link>
            <span className="inline-flex rounded-lg bg-violet-500/10 px-2 py-1 text-xs font-bold text-violet-300">🛡️ {u.streak_freezes??0} escudo(s)</span>
            {u.role!=='USER'&&<span className="inline-flex rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-400">{u.role}</span>}
          </div>
          {u.bio&&<p className="mt-3 text-sm text-slate-400">{u.bio}</p>}
        </div>
        <SignOutButton/>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="XP" value={Number(u.xp).toLocaleString('pt-BR')}/>
        <StatCard label="Streak" value={u.current_streak+' dias'}/>
        <StatCard label="Palpites" value={u.predictions}/>
        <StatCard label="Acerto" value={u.accuracy+'%'}/>
      </div>
    </section>

    <section>
      <SectionTitle eyebrow="Atalhos" title="Sua Arena"/>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Link href={'/u/'+u.username} className="arena-card p-5 font-bold transition hover:border-emerald-500/30">👤 Perfil público</Link>
        <Link href="/estatisticas" className="arena-card p-5 font-bold transition hover:border-violet-500/30">📊 Estatísticas PRO</Link>
        <Link href="/planos" className="arena-card p-5 font-bold transition hover:border-violet-500/30">✨ Planos</Link>\n        <Link href="/assinatura" className="arena-card p-5 font-bold transition hover:border-sky-500/30">💳 Assinatura</Link>
        <Link href="/meu-time" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">⚽ Meu time</Link>
        <Link href="/ligas" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">🏟️ Minhas ligas</Link>
        <Link href="/feed" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">🌐 Feed</Link>
        <Link href="/palpites" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">🎯 Meus palpites</Link>
        <Link href="/conquistas" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">🏆 Conquistas</Link>
        <Link href="/notificacoes" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">🔔 Notificações</Link>
        <Link href="/indicacoes" className="arena-card p-5 font-bold transition hover:border-emerald-500/30">🤝 Indicações</Link>
      </div>
    </section>

    <section>
      <SectionTitle eyebrow="Performance" title="Seu histórico"/>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Acertos" value={u.hits}/>
        <StatCard label="Placares exatos" value={u.exact}/>
        <StatCard label="Melhor streak" value={u.best_streak+' dias'}/>
      </div>
    </section>

    <ProfileEditForm
      teams={(teams??[]) as any[]}
      initial={{
        name:u.name||'',
        username:u.username||'',
        city:u.city||'',
        state:u.state||'',
        bio:u.bio||'',
        favoriteTeamId:u.favorite_team_id||''
      }}
    />
  </div>;
}
