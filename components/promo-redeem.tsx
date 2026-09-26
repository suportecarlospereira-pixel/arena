'use client';

import Link from 'next/link';
import {useState} from 'react';

export function PromoRedeem({signedIn}:{signedIn:boolean}){
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const [ok,setOk]=useState(false);

  if(!signedIn){
    return <section className="arena-card p-5">
      <div className="arena-label">Cupom</div>
      <h3 className="mt-1 text-xl font-black">Tem um código promocional?</h3>
      <p className="mt-2 text-sm text-slate-500">Entre na sua conta para resgatar benefícios.</p>
      <Link href="/login" className="arena-button mt-4 inline-flex">ENTRAR</Link>
    </section>;
  }

  async function redeem(e:React.FormEvent){
    e.preventDefault();
    const clean=code.trim().toUpperCase();
    if(!clean||busy) return;

    setBusy(true);
    setMsg('');
    setOk(false);

    const r=await fetch('/api/promos/redeem',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({code:clean})
    });
    const j=await r.json();

    if(r.ok){
      setOk(true);
      const label=j.plan==='PRO_PLUS'?'PRO+':j.plan;
      setMsg(label+' liberado por '+j.days+' dia(s). Atualizando seus benefícios...');
      setTimeout(()=>location.reload(),900);
    }else{
      setMsg(j.error||'Não foi possível resgatar este código.');
    }

    setBusy(false);
  }

  return <section className="arena-card p-5">
    <div className="arena-label">Cupom / trial</div>
    <h3 className="mt-1 text-xl font-black">Tem um código promocional?</h3>
    <p className="mt-2 text-sm text-slate-500">Resgates de trial não alteram sua assinatura paga nem renovam cobrança.</p>

    <form onSubmit={redeem} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input
        value={code}
        onChange={e=>setCode(e.target.value.toUpperCase())}
        minLength={4}
        maxLength={32}
        required
        placeholder="EX.: BEMVINDO7"
        className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono uppercase outline-none focus:border-violet-500"
      />
      <button disabled={busy} className="arena-button disabled:opacity-50">
        {busy?'VALIDANDO...':'RESGATAR'}
      </button>
    </form>

    {msg&&<p className={'mt-3 text-sm '+(ok?'text-emerald-400':'text-slate-400')}>{msg}</p>}
  </section>;
}
