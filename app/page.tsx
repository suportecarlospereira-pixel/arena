import Link from 'next/link';
import { Flame, Sparkles, ChevronRight } from 'lucide-react';
import { getMatches, getCurrentProfile, getCurrentChallenge } from '@/lib/data';
import { MatchCard } from '@/components/match-card';
import { StatCard } from '@/components/stat-card';
import { SectionTitle } from '@/components/section-title';

export const dynamic='force-dynamic';

export default async function Home(){
  const [matches,user,challenge]=await Promise.all([
    getMatches(4),
    getCurrentProfile(),
    getCurrentChallenge()
  ]);

  return <div className="space-y-7">
    <section className="arena-card overflow-hidden p-5 sm:p-7">
      <div className="relative">
        <div className="arena-label">Bem-vindo à Arena</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          {user?`Olá, ${user.name||user.username} 👋`:'Futebol. Inteligência. Competição.'}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Acompanhe futebol real, faça palpites gratuitos, dispute rankings e evolua seu perfil.
        </p>

        {user
          ? <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Sequência" value={`🔥 ${user.current_streak} dias`} hint={`Recorde ${user.best_streak}`}/>
              <StatCard label="XP" value={Number(user.xp).toLocaleString('pt-BR')}/>
              <StatCard label="Nível" value={user.level}/>
              <StatCard label="Palpites" value={user.predictions}/>
            </div>
          : <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register" className="arena-button">CRIAR CONTA GRÁTIS</Link>
              <Link href="/login" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold">ENTRAR</Link>
            </div>}
      </div>
    </section>

    <section>
      <SectionTitle eyebrow="Agenda real" title="Próximos jogos" action={<Link href="/jogos" className="text-sm font-bold text-emerald-400">Ver todos</Link>}/>
      <div className="grid gap-3 xl:grid-cols-2">
        {matches.slice(0,2).map(m=><MatchCard key={m.id} match={m}/>)}
      </div>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <Link href="/conquistas" className="arena-card p-5">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-orange-500/15 p-3 text-orange-400"><Flame/></span>
          <div>
            <div className="arena-label">Desafio ativo</div>
            <h3 className="font-black">{challenge?.name??'Novos desafios em breve'}</h3>
          </div>
        </div>

        {challenge&&<>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-emerald-500" style={{width:`${challenge.percent}%`}}/>
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{challenge.completed?'Concluído':`${challenge.current}/${challenge.needed} palpites`}</span>
            <b className="text-emerald-400">+{challenge.xp_reward} XP</b>
          </div>
        </>}
      </Link>

      <Link href="/arena-ai" className="arena-card group p-5">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-sky-500/15 p-3 text-sky-400"><Sparkles/></span>
          <div className="flex-1">
            <div className="arena-label">Arena AI</div>
            <h3 className="font-black">Análise baseada nos dados da Arena</h3>
            <p className="mt-1 text-xs text-slate-500">Sem inventar estatísticas.</p>
          </div>
          <ChevronRight className="text-slate-600 transition group-hover:translate-x-1"/>
        </div>
      </Link>
    </section>
  </div>
}
