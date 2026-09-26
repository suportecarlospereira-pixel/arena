'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/logo';
import { createClient } from '@/lib/supabase/client';

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    city: '',
    state: 'SC',
    birthDate: '',
  });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
        data: {
          name: form.name,
          username: form.username,
          city: form.city,
          state: form.state,
          birth_date: form.birthDate,
        },
      },
    });

    setMsg(
      error
        ? error.message
        : 'Cadastro criado. Verifique seu e-mail para confirmar a conta.'
    );
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <form onSubmit={submit} className="arena-card w-full max-w-xl p-6">
        <Logo />
        <h1 className="mt-8 text-3xl font-black">Criar conta</h1>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Nome" value={form.name} set={(v) => setForm({ ...form, name: v })} />
          <Field label="Username" value={form.username} set={(v) => setForm({ ...form, username: v })} />
          <Field label="E-mail" type="email" value={form.email} set={(v) => setForm({ ...form, email: v })} />
          <Field label="Senha" type="password" value={form.password} set={(v) => setForm({ ...form, password: v })} />
          <Field label="Nascimento" type="date" value={form.birthDate} set={(v) => setForm({ ...form, birthDate: v })} />
          <Field label="Cidade" value={form.city} set={(v) => setForm({ ...form, city: v })} />
          <label className="block text-sm font-bold sm:col-span-2">
            Estado
            <input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
              maxLength={2}
              required
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 uppercase outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        <button disabled={busy} className="arena-button mt-5 w-full disabled:opacity-50">
          {busy ? 'CRIANDO...' : 'CRIAR MINHA CONTA'}
        </button>

        {msg && <p className="mt-3 text-center text-xs text-slate-400">{msg}</p>}

        <p className="mt-5 text-center text-sm text-slate-500">
          Já tem conta?{' '}
          <Link href="/login" className="font-bold text-emerald-400">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  set,
  type = 'text',
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => set(e.target.value)}
        required
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"
      />
    </label>
  );
}
