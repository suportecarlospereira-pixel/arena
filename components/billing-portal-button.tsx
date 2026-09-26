'use client';

import {useState} from 'react';

export function BillingPortalButton(){
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  async function open(){
    setBusy(true);
    setMsg('');

    const r=await fetch('/api/billing/portal',{method:'POST'});
    const j=await r.json();

    if(r.ok&&j.url){
      window.location.href=j.url;
      return;
    }

    setMsg(j.error||'Não foi possível abrir a cobrança.');
    setBusy(false);
  }

  return <div>
    <button onClick={open} disabled={busy} className="arena-button disabled:opacity-50">
      {busy?'ABRINDO...':'GERENCIAR NA STRIPE'}
    </button>
    {msg&&<p className="mt-2 text-xs text-slate-500">{msg}</p>}
  </div>;
}
