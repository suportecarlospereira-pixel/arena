'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/logo';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }

    location.href = '/';
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="arena-card w-full max-w-md p-6">
        <Logo />
        <h1 className="mt-8 text-3xl font-black">Entrar</h1>
        <p className="mt-1 text-sm text-slate-500">Continue sua sequência na Arena.</p>

        <label className="mt-6 block text-sm font-bold">
          E-mail
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"
          />
        </label>

        <label className="mt-4 block text-sm font-bold">
          Senha
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"
          />
        </label>

        <div className="mt-3 text-right">
          <Link href="/forgot-password" className="text-xs font-bold text-emerald-400">
            Esqueci minha senha
          </Link>
        </div>

        <button disabled={busy} className="arena-button mt-5 w-full disabled:opacity-50">
          {busy ? 'ENTRANDO...' : 'ENTRAR'}
        </button>

        {msg && <p className="mt-3 text-center text-xs text-slate-400">{msg}</p>}

        <p className="mt-5 text-center text-sm text-slate-500">
          Ainda não tem conta?{' '}
          <Link href="/register" className="font-bold text-emerald-400">
            Criar conta
          </Link>
        </p>
      </form>
    </div>
  );
}
