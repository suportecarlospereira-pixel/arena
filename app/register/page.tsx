'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/logo';
import { createClient } from '@/lib/supabase/client';

function friendlyAuthError(message:string){
  const lower=message.toLowerCase();
  if(lower.includes('already registered')||lower.includes('already been registered')) return 'Este e-mail já possui uma conta.';
  if(lower.includes('password')) return 'A senha não atende aos requisitos de segurança.';
  if(lower.includes('rate limit')) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  return 'Não foi possível criar a conta. Verifique os dados e tente novamente.';
}

export default function Register() {
  const [form,setForm]=useState({
    name:'',
    username:'',
    email:'',
    password:'',
    city:'',
    state:'SC',
    birthDate:'',
  });
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  async function submit(e:React.FormEvent){
    e.preventDefault();
    setBusy(true);
    setMsg('');

    const username=form.username.trim().toLowerCase();
    const referrer=new URLSearchParams(location.search).get('ref')?.trim().toLowerCase()||null;
    const supabase=createClient();

    const {data:available,error:usernameError}=await supabase.rpc('username_available',{
      p_username:username,
    });

    if(usernameError){
      setMsg('Não foi possível validar o username agora. Tente novamente.');
      setBusy(false);
      return;
    }

    if(!available){
      setMsg('Este username já está em uso ou é inválido.');
      setBusy(false);
      return;
    }

    const {error}=await supabase.auth.signUp({
      email:form.email.trim().toLowerCase(),
      password:form.password,
      options:{
        emailRedirectTo:`${location.origin}/auth/callback`,
        data:{
          name:form.name.trim(),
          username,
          city:form.city.trim(),
          state:form.state.toUpperCase(),
          birth_date:form.birthDate,
          referrer,
        },
      },
    });

    setMsg(
      error
        ? friendlyAuthError(error.message||'')
        : 'Cadastro criado. Verifique seu e-mail para confirmar a conta.'
    );
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <form onSubmit={submit} className="arena-card w-full max-w-xl p-6">
        <Logo/>
        <h1 className="mt-8 text-3xl font-black">Criar conta</h1>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Nome" value={form.name} set={(v)=>setForm({...form,name:v})}/>
          <Field label="Username" value={form.username} set={(v)=>setForm({...form,username:v.replace(/[^a-zA-Z0-9_.-]/g,'')})} minLength={3}/>
          <Field label="E-mail" type="email" value={form.email} set={(v)=>setForm({...form,email:v})}/>
          <Field label="Senha" type="password" value={form.password} set={(v)=>setForm({...form,password:v})} minLength={8}/>
          <Field label="Nascimento" type="date" value={form.birthDate} set={(v)=>setForm({...form,birthDate:v})}/>
          <Field label="Cidade" value={form.city} set={(v)=>setForm({...form,city:v})}/>
          <label className="block text-sm font-bold sm:col-span-2">
            Estado
            <input
              value={form.state}
              onChange={(e)=>setForm({...form,state:e.target.value.toUpperCase().slice(0,2)})}
              maxLength={2}
              required
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 uppercase outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        <button disabled={busy} className="arena-button mt-5 w-full disabled:opacity-50">
          {busy?'VALIDANDO...':'CRIAR MINHA CONTA'}
        </button>

        {msg&&<p className="mt-3 text-center text-xs text-slate-400">{msg}</p>}

        <p className="mt-5 text-center text-sm text-slate-500">
          Já tem conta? <Link href="/login" className="font-bold text-emerald-400">Entrar</Link>
        </p>
      </form>
    </div>
  );
}

function Field({
  label,value,set,type='text',minLength
}:{
  label:string;
  value:string;
  set:(v:string)=>void;
  type?:string;
  minLength?:number;
}){
  return (
    <label className="block text-sm font-bold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e)=>set(e.target.value)}
        required
        minLength={minLength}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"
      />
    </label>
  );
}
