'use client';

import {useState} from 'react';
import Link from 'next/link';

type Plan='PRO'|'PRO_PLUS';

export function UpgradeButton({
  plan,
  signedIn,
  current,
  pending
}:{
  plan:Plan;
  signedIn:boolean;
  current:'FREE'|'PRO'|'PRO_PLUS'|null;
  pending:'PRO'|'PRO_PLUS'|null;
}){
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState(pending===plan);
  const [msg,setMsg]=useState('');

  if(!signedIn){
    return <Link href="/register" className="arena-button mt-5 w-full text-center">CRIAR CONTA</Link>;
  }

  if(current===plan){
    return <button disabled className="mt-5 w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-400">PLANO ATUAL</button>;
  }

  async function request(){
    setBusy(true);setMsg('');
    const r=await fetch('/api/billing/request-upgrade',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({plan})
    });
    const j=await r.json();
    if(r.ok){
      setSent(true);
      setMsg('Solicitação enviada. Ela já apareceu no painel comercial.');
    }else{
      setMsg(j.error||'Não foi possível solicitar agora.');
    }
    setBusy(false);
  }

  return <div className="mt-5">
    <button
      disabled={busy||sent}
      onClick={request}
      className={plan==='PRO_PLUS'?'arena-button w-full disabled:opacity-60':'arena-button-secondary w-full disabled:opacity-60'}
    >
      {busy?'ENVIANDO...':sent?'SOLICITAÇÃO ENVIADA':`QUERO ${plan==='PRO_PLUS'?'PRO+':'PRO'}`}
    </button>
    {msg&&<p className="mt-2 text-xs text-slate-500">{msg}</p>}
  </div>;
}
