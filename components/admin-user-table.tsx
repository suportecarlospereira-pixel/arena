'use client';

import { useState } from 'react';

type Row = {
  id:string;
  username:string|null;
  name:string|null;
  role:'USER'|'MODERATOR'|'ADMIN'|'SUPER_ADMIN';
  plan_code:'FREE'|'PRO'|'PRO_PLUS';
  xp:number;
  city:string|null;
  state:string|null;
  created_at:string;
};

export function AdminUserTable({initialRows,currentUserId}:{initialRows:Row[];currentUserId:string}) {
  const [rows,setRows]=useState(initialRows);
  const [busy,setBusy]=useState<string|null>(null);
  const [msg,setMsg]=useState('');

  async function update(id:string,payload:Record<string,string>) {
    setBusy(id);
    setMsg('');
    const r=await fetch(`/api/admin/users/${id}`,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    const j=await r.json();
    if(!r.ok){setMsg(j.error||'Erro ao atualizar.');setBusy(null);return;}
    setRows(v=>v.map(row=>row.id===id?{...row,...j.user}:row));
    setMsg('Alteração salva.');
    setBusy(null);
  }

  return <div className="space-y-3">
    {msg&&<div className="arena-panel px-4 py-3 text-sm text-slate-300">{msg}</div>}
    <div className="arena-card overflow-x-auto">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr><th className="p-4">Usuário</th><th>Local</th><th>XP</th><th>Role</th><th>Plano</th><th className="pr-4">Criado</th></tr>
        </thead>
        <tbody>
          {rows.map(row=><tr key={row.id} className="border-b border-white/5 last:border-0">
            <td className="p-4">
              <b className="block">{row.name||'Sem nome'}</b>
              <span className="text-xs text-slate-500">@{row.username||'sem-username'}{row.id===currentUserId?' • você':''}</span>
            </td>
            <td>{row.city||'-'}/{row.state||'-'}</td>
            <td>{Number(row.xp).toLocaleString('pt-BR')}</td>
            <td>
              <select
                disabled={busy===row.id || row.id===currentUserId}
                value={row.role}
                onChange={e=>update(row.id,{role:e.target.value})}
                className="rounded-xl border border-white/10 bg-[#0b0e14] px-3 py-2"
              >
                <option>USER</option><option>MODERATOR</option><option>ADMIN</option><option>SUPER_ADMIN</option>
              </select>
            </td>
            <td>
              <select
                disabled={busy===row.id}
                value={row.plan_code}
                onChange={e=>update(row.id,{plan:e.target.value})}
                className="rounded-xl border border-white/10 bg-[#0b0e14] px-3 py-2"
              >
                <option>FREE</option><option>PRO</option><option>PRO_PLUS</option>
              </select>
            </td>
            <td className="pr-4 text-xs text-slate-500">{new Date(row.created_at).toLocaleDateString('pt-BR')}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>
}
