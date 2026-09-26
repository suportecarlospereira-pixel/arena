import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMatches } from '@/lib/data';
import { fmtDate } from '@/lib/utils';

const Schema = z.object({ question: z.string().min(2).max(800) });

export async function POST(req:Request) {
  try {
    const {question}=Schema.parse(await req.json());
    const matches=await getMatches(25);
    const q=question.toLocaleLowerCase('pt-BR');

    const selected=matches.filter((m)=>
      q.includes(m.home.name.toLocaleLowerCase('pt-BR')) ||
      q.includes(m.away.name.toLocaleLowerCase('pt-BR'))
    );

    const list=(selected.length?selected:matches.slice(0,5))
      .slice(0,5)
      .map((m)=>`${m.home.name} x ${m.away.name} — ${fmtDate(m.startsAt)} — ${m.competition}`)
      .join('\n');

    const answer=list
      ? `Encontrei estes jogos reais na Arena:\n\n${list}\n\nNão vou inventar estatísticas que ainda não estejam disponíveis no banco.`
      : 'Não encontrei jogos reais na janela atual.';

    return NextResponse.json({answer,provider:'ArenaDatabase'});
  } catch {
    return NextResponse.json({error:'Pergunta inválida.'},{status:400});
  }
}
