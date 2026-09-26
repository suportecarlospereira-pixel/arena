'use client';

import { useState } from 'react';
import type { Match } from '@/lib/types';
import { fmtDate } from '@/lib/utils';

export function AdminMatchTable({initial}:{initial:Match[]}){
  const [items,setItems]=useState(initial);
  const [busy,setBusy]=useState<string|null>(null);
  const [msg,setMsg]=useState('');

  async function save(m:Match,status:string,home:string,away:string){
    setBusy(m.id);setMsg('');
    const r=await fetch(`/api/admin/matches/${m.id}`,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        status,
        homeScore:home===''?null:Number(home),
        awayScore:away===''?null:Number(away)
      })
    });
    const j=await r.json();
    setMsg(r.ok?'Partida atualizada.':(j.error||'Erro ao atualizar.'));
    setBusy(null);
    if(r.ok) location.reload();
  }

  return <div className="space-y-3">
    {msg&&<div className="arena-panel px-4 py-3 text-sm text-slate-300">{msg}</div>}
    {items.map(m=><MatchEditor key={m.id} match={m} busy={busy===m.id} onSave={save}/>)}
  </div>
}

function MatchEditor({match,busy,onSave}:{match:Match;busy:boolean;onSave:(m:Match,s:string,h:string,a:string)=>void}){
  const [status,setStatus]=useState(match.status);
  const [home,setHome]=useState(match.homeScore==null?'':String(match.homeScore));
  const [away,setAway]=useState(match.awayScore==null?'':String(match.awayScore));

  return <div className="arena-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <b>{match.home.name} × {match.away.name}</b>
        <div className="mt-1 text-xs text-slate-500">{match.competition} • {fmtDate(match.startsAt)}</div>
      </div>
      <span className="text-[11px] text-slate-600">{match.provider||'manual'} #{match.providerId||'-'}</span>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-[160px_90px_90px_auto]">
      <select value={status} onChange={e=>setStatus(e.target.value as Match['status'])} className="rounded-xl border border-white/10 bg-[#0b0e14] px-3 py-2">
        <option>SCHEDULED</option><option>LIVE</option><option>FINISHED</option><option>POSTPONED</option><option>CANCELLED</option>
      </select>
      <input value={home} onChange={e=>setHome(e.target.value.replace(/\D/g,'').slice(0,2))} placeholder="Casa" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"/>
      <input value={away} onChange={e=>setAway(e.target.value.replace(/\D/g,'').slice(0,2))} placeholder="Fora" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"/>
      <button disabled={busy} onClick={()=>onSave(match,status,home,away)} className="arena-button py-2 disabled:opacity-50">{busy?'SALVANDO...':'SALVAR'}</button>
    </div>
  </div>
}
