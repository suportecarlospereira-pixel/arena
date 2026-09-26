import { NextResponse } from 'next/server';

export async function GET() {
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return NextResponse.json({
    ok: true,
    service: 'arena',
    version: '0.1.0',
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && publicKey
    ),
    time: new Date().toISOString(),
  });
}
