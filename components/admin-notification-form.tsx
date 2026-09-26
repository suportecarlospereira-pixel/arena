'use client';

import { useState } from 'react';

export function AdminNotificationForm() {
  const [title,setTitle]=useState('');
  const [body,setBody]=useState('');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  async function submit(e:React.FormEvent){
    e.preventDefault();
    setBusy(true);setMsg('');
    const r=await fetch('/api/admin/notifications',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({title,body})
    });
    const j=await r.json();
    setMsg(r.ok?`Notificação enviada para ${j.recipients} usuário(s).`:(j.error||'Erro ao enviar.'));
    if(r.ok){setTitle('');setBody('');}
    setBusy(false);
  }

  return <form onSubmit={submit} className="arena-card max-w-2xl p-5">
    <label className="block text-sm font-bold">Título
      <input value={title} onChange={e=>setTitle(e.target.value)} required minLength={2} maxLength={120}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"/>
    </label>
    <label className="mt-4 block text-sm font-bold">Mensagem
      <textarea value={body} onChange={e=>setBody(e.target.value)} required minLength={2} maxLength={1000} rows={5}
        className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"/>
    </label>
    <button disabled={busy} className="arena-button mt-4 disabled:opacity-50">{busy?'ENVIANDO...':'ENVIAR PARA TODOS'}</button>
    {msg&&<p className="mt-3 text-sm text-slate-400">{msg}</p>}
  </form>
}
