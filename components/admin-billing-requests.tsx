'use client';

import {useState} from 'react';

type Row={
  id:string;
  user_id:string;
  username:string|null;
  name:string|null;
  current_plan:'FREE'|'PRO'|'PRO_PLUS';
  requested_plan:'PRO'|'PRO_PLUS';
  status:string;
  source:string;
  note:string|null;
  created_at:string;
};

export function AdminBillingRequests({initial}:{initial:Row[]}){
  const [rows,setRows]=useState(initial);
  const [busy,setBusy]=useState<string|null>(null);
  const [msg,setMsg]=useState('');

  async function resolve(id:string,approve:boolean){
    setBusy(id);
    setMsg('');

    const r=await fetch('/api/admin/billing/'+id,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({approve})
    });
    const j=await r.json();

    if(r.ok){
      setRows(v=>v.map(x=>x.id===id?{
        ...x,
        status:approve?'RESOLVED':'CANCELLED',
        current_plan:approve?x.requested_plan:x.current_plan
      }:x));
      setMsg(approve?'Plano ativado com sucesso.':'Solicitação recusada.');
    }else{
      setMsg(j.error||'Não foi possível concluir.');
    }

    setBusy(null);
  }

  return <div className="space-y-3">
    {msg&&<div className="arena-panel px-4 py-3 text-sm text-slate-300">{msg}</div>}

    <div className="arena-card overflow-x-auto">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="p-4">Usuário</th>
            <th>Atual</th>
            <th>Solicitado</th>
            <th>Status</th>
            <th>Data</th>
            <th className="pr-4 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row=><tr key={row.id} className="border-b border-white/5 last:border-0">
            <td className="p-4">
              <b className="block">{row.name||'Sem nome'}</b>
              <span className="text-xs text-slate-500">@{row.username||'sem-username'}</span>
            </td>
            <td>{row.current_plan==='PRO_PLUS'?'PRO+':row.current_plan}</td>
            <td><b className="text-violet-300">{row.requested_plan==='PRO_PLUS'?'PRO+':row.requested_plan}</b></td>
            <td>
              <span className={row.status==='PENDING'?'text-amber-400':row.status==='RESOLVED'?'text-emerald-400':'text-slate-500'}>
                {row.status}
              </span>
            </td>
            <td className="text-xs text-slate-500">{new Date(row.created_at).toLocaleString('pt-BR')}</td>
            <td className="pr-4">
              {['PENDING','CONTACTED'].includes(row.status)
                ? <div className="flex justify-end gap-2">
                    <button disabled={busy===row.id} onClick={()=>resolve(row.id,false)} className="rounded-xl border border-red-500/20 px-3 py-2 text-xs font-bold text-red-400 disabled:opacity-50">RECUSAR</button>
                    <button disabled={busy===row.id} onClick={()=>resolve(row.id,true)} className="arena-button py-2 text-xs disabled:opacity-50">{busy===row.id?'AGUARDE...':'APROVAR'}</button>
                  </div>
                : <div className="text-right text-xs text-slate-600">Concluído</div>}
            </td>
          </tr>)}
        </tbody>
      </table>

      {!rows.length&&<div className="p-6 text-sm text-slate-400">Nenhuma solicitação de upgrade ainda.</div>}
    </div>
  </div>;
}
