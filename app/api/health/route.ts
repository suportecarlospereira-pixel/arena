import { NextResponse } from 'next/server';
import { SUPABASE_CONFIGURED } from '@/lib/supabase/config';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'arena',
    version: '0.1.0',
    supabaseConfigured: SUPABASE_CONFIGURED,
    time: new Date().toISOString(),
  });
}
