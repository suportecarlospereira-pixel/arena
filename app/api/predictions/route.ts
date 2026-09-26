import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Schema = z.object({
  matchId: z.string().uuid(),
  pick: z.enum(['HOME', 'DRAW', 'AWAY']),
  homeScore: z.number().int().min(0).max(99).nullable(),
  awayScore: z.number().int().min(0).max(99).nullable(),
});

export async function POST(req: Request) {
  try {
    const input = Schema.parse(await req.json());
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Faça login para palpitar.' },
        { status: 401 }
      );
    }

    const { data, error } = await supabase.rpc('submit_prediction', {
      p_match_id: input.matchId,
      p_pick: input.pick,
      p_home_score: input.homeScore,
      p_away_score: input.awayScore,
    });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data,
      message: 'Palpite salvo! +5 XP',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados de palpite inválidos.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno.' },
      { status: 500 }
    );
  }
}
