'use client';

import { useState } from 'react';

type ReviewRow={
  match_id:string;
  competition:string;
  home_team:string;
  away_team:string;
  canonical_home_score:number|null;
  canonical_away_score:number|null;
  result_confirmed_at:string|null;
  result_disputed:boolean;
  result_locked:boolean;
  result_revision:number;
  latest_provider_status:string|null;
  latest_provider_home_score:number|null;
  latest_provider_away_score:number|null;
  latest_observed_at:string|null;
};

export function AdminResultReview({rows,isSuperAdmin}:{rows:ReviewRow[];isSuperAdmin:boolean}){
  return <div className="space-y-3">
    {rows.map(row=><ReviewCard key={row.match_id} row={row} isSuperAdmin={isSuperAdmin}/>)}
    {!rows.length&&<div className="arena-card p-6 text-sm text-slate-400">Nenhum resultado aguardando revisão.</div>}
  </div>
}

function ReviewCard({row,isSuperAdmin}:{row:ReviewRow;isSuperAdmin:boolean}){
  const [home,setHome]=useState(String(row.latest_provider_home_score??row.canonical_home_score??0));
  const [away,setAway]=useState(String(row.latest_provider_away_score??row.canonical_away_score??0));
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  async function resolve(){
    if(!isSuperAdmin) return;
    if(!window.confirm('Confirmar e TRAVAR este resultado? O sistema reconciliará os palpites usando este placar.')) return;

    setBusy(true);
    setMsg('');

    const r=await fetch('/api/admin/matches/'+row.match_id+'/resolve',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({homeScore:Number(home),awayScore:Number(away)})
    });
    const j=await r.json();

    if(r.ok){
      setMsg('Resultado confirmado e travado. Atualizando...');
      setTimeout(()=>location.reload(),700);
    }else{
      setMsg(j.error||'Erro ao resolver resultado.');
    }
    setBusy(false);
  }

  const observed=row.latest_observed_at
    ? ' • '+new Date(row.latest_observed_at).toLocaleString('pt-BR')
    : '';

  return <div className={'arena-card p-5 '+(row.result_disputed?'border-red-500/30':'border-amber-500/20')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="arena-label">{row.competition}</div>
        <h3 className="mt-1 text-lg font-black">{row.home_team} × {row.away_team}</h3>
      </div>
      <span className={'rounded-xl px-3 py-1 text-xs font-black '+(row.result_disputed?'bg-red-500/15 text-red-400':'bg-amber-500/15 text-amber-400')}>
        {row.result_disputed?'DIVERGÊNCIA':'AGUARDANDO CONFIRMAÇÃO'}
      </span>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="arena-panel p-4">
        <div className="arena-label">Resultado canônico</div>
        <div className="mt-2 text-2xl font-black">{row.canonical_home_score??'—'} × {row.canonical_away_score??'—'}</div>
        <div className="mt-1 text-xs text-slate-600">Revisão {row.result_revision}</div>
      </div>
      <div className="arena-panel p-4">
        <div className="arena-label">Última observação da fonte</div>
        <div className="mt-2 text-2xl font-black">{row.latest_provider_home_score??'—'} × {row.latest_provider_away_score??'—'}</div>
        <div className="mt-1 text-xs text-slate-600">{row.latest_provider_status||'—'}{observed}</div>
      </div>
    </div>

    {isSuperAdmin&&<div className="mt-4 grid gap-2 sm:grid-cols-[100px_100px_auto]">
      <input value={home} onChange={e=>setHome(e.target.value.replace(/\\D/g,'').slice(0,2))} inputMode="numeric" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" aria-label="Placar mandante"/>
      <input value={away} onChange={e=>setAway(e.target.value.replace(/\\D/g,'').slice(0,2))} inputMode="numeric" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" aria-label="Placar visitante"/>
      <button disabled={busy||home===''||away===''} onClick={resolve} className="arena-button disabled:opacity-50">
        {busy?'SALVANDO...':'CONFIRMAR E TRAVAR RESULTADO'}
      </button>
    </div>}

    {!isSuperAdmin&&<p className="mt-4 text-xs text-slate-500">Apenas SUPER_ADMIN pode resolver divergências de resultado.</p>}
    {msg&&<p className="mt-3 text-sm text-slate-400">{msg}</p>}
  </div>
}
