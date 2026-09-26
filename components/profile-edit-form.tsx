'use client';

import { useState } from 'react';

export function ProfileEditForm({initial}:{initial:{name:string;username:string;city:string;state:string}}){
  const [f,setF]=useState(initial);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setMsg('');
    const r=await fetch('/api/profile',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(f)});
    const j=await r.json();
    setMsg(r.ok?'Perfil atualizado.':(j.error||'Erro ao atualizar.'));
    setBusy(false);
    if(r.ok) setTimeout(()=>location.reload(),500);
  }

  return <form onSubmit={submit} className="arena-card p-5">
    <div className="arena-label">Editar perfil</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {([
        ['name','Nome'],
        ['username','Username'],
        ['city','Cidade'],
        ['state','UF']
      ] as const).map(([key,label])=><label key={key} className="text-sm font-bold">{label}
        <input value={f[key]||''} onChange={e=>setF({...f,[key]:key==='state'?e.target.value.toUpperCase().slice(0,2):e.target.value})}
          maxLength={key==='state'?2:80} required
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"/>
      </label>)}
    </div>
    <button disabled={busy} className="arena-button mt-4 disabled:opacity-50">{busy?'SALVANDO...':'SALVAR PERFIL'}</button>
    {msg&&<p className="mt-3 text-sm text-slate-400">{msg}</p>}
  </form>
}
