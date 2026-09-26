'use client';

import Link from 'next/link';
import {useState} from 'react';

export function LeagueManager({
  owned,
  limit
}:{
  owned:number;
  limit:number;
}){
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const canCreate=owned<limit;

  async function post(payload:any){
    setBusy(true);
    setMsg('');

    const r=await fetch('/api/leagues',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    const j=await r.json();

    if(r.ok){
      if(j.leagueId) location.href='/ligas/'+j.leagueId;
      else location.reload();
      return;
    }

    setMsg(j.error||'Não foi possível concluir.');
    setBusy(false);
  }

  return <div className="grid gap-4 lg:grid-cols-2">
    <form onSubmit={e=>{e.preventDefault();if(canCreate)post({action:'create',name,description})}} className="arena-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="arena-label">Criar liga privada</div>
          <h3 className="mt-1 text-xl font-black">Dispute com seus amigos</h3>
        </div>
        <span className="rounded-xl bg-white/[.05] px-3 py-2 text-xs font-black text-slate-400">{owned}/{limit}</span>
      </div>

      {canCreate?<>
        <input value={name} onChange={e=>setName(e.target.value)} minLength={3} maxLength={60} required placeholder="Nome da liga" className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"/>
        <textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={300} placeholder="Descrição (opcional)" rows={3} className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"/>
        <button disabled={busy} className="arena-button mt-3 w-full disabled:opacity-50">CRIAR LIGA</button>
      </>:<div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/[.06] p-4">
        <b>Limite do plano atingido.</b>
        <p className="mt-1 text-xs leading-5 text-slate-500">PRO permite até 5 ligas e PRO+ até 20.</p>
        <Link href="/planos" className="arena-button mt-3 inline-flex">VER PLANOS</Link>
      </div>}

      {msg&&<p className="mt-3 text-sm text-slate-400">{msg}</p>}
    </form>

    <form onSubmit={e=>{e.preventDefault();post({action:'join',code})}} className="arena-card p-5">
      <div className="arena-label">Entrar por convite</div>
      <h3 className="mt-1 text-xl font-black">Já recebeu um código?</h3>
      <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required placeholder="CÓDIGO DA LIGA" className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 p-3 uppercase outline-none focus:border-emerald-500"/>
      <button disabled={busy} className="arena-button mt-3 w-full disabled:opacity-50">ENTRAR NA LIGA</button>
    </form>
  </div>;
}
