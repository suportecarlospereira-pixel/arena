import { MatchCard } from '@/components/match-card';
import { SectionTitle } from '@/components/section-title';
import { getMatches } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function Jogos() {
  const matches = await getMatches(80);

  return (
    <div>
      <SectionTitle eyebrow="Agenda oficial" title="Jogos reais" />

      <div className="mb-5 arena-panel px-4 py-3 text-xs leading-5 text-slate-400">
        Agenda sincronizada automaticamente com o provider esportivo. Horários exibidos no fuso de Brasília.
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {matches.map((m)=><MatchCard key={m.id} match={m}/>)}
      </div>

      {!matches.length && (
        <div className="arena-card p-6 text-sm text-slate-400">
          Nenhuma partida encontrada na janela atual.
        </div>
      )}
    </div>
  );
}
