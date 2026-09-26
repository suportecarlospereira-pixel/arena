'use client';

import { useState } from 'react';

export function AdminGamificationForm(){
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  const [challenge,setChallenge]=useState({
    name:'',description:'',xpReward:'100',predictions:'3',startsAt:'',endsAt:''
  });
  const [achievement,setAchievement]=useState({
    code:'',name:'',description:'',xpReward:'100'
  });

  async function post(payload:unknown){
    setBusy(true);setMsg('');
    const r=await fetch('/api/admin/gamification',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    const j=await r.json();
    setMsg(r.ok?'Salvo com sucesso.':(j.error||'Erro ao salvar.'));
    setBusy(false);
    if(r.ok) setTimeout(()=>location.reload(),400);
  }

  return <div className="grid gap-4 xl:grid-cols-2">
    <form onSubmit={e=>{e.preventDefault();post({type:'challenge',...challenge})}} className="arena-card p-5">
      <div className="arena-label">Novo desafio</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Nome" value={challenge.name} set={v=>setChallenge({...challenge,name:v})}/>
        <Field label="XP" type="number" value={challenge.xpReward} set={v=>setChallenge({...challenge,xpReward:v})}/>
        <Field label="Qtd. palpites" type="number" value={challenge.predictions} set={v=>setChallenge({...challenge,predictions:v})}/>
        <Field label="Início" type="datetime-local" value={challenge.startsAt} set={v=>setChallenge({...challenge,startsAt:v})}/>
        <Field label="Fim" type="datetime-local" value={challenge.endsAt} set={v=>setChallenge({...challenge,endsAt:v})}/>
        <label className="sm:col-span-2 text-sm font-bold">Descrição
          <textarea value={challenge.description} onChange={e=>setChallenge({...challenge,description:e.target.value})} required rows={3}
            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"/>
        </label>
      </div>
      <button disabled={busy} className="arena-button mt-4 disabled:opacity-50">CRIAR DESAFIO</button>
    </form>

    <form onSubmit={e=>{e.preventDefault();post({type:'achievement',...achievement})}} className="arena-card p-5">
      <div className="arena-label">Nova conquista</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Código" value={achievement.code} set={v=>setAchievement({...achievement,code:v.toUpperCase().replace(/[^A-Z0-9_]/g,'')})}/>
        <Field label="Nome" value={achievement.name} set={v=>setAchievement({...achievement,name:v})}/>
        <Field label="XP" type="number" value={achievement.xpReward} set={v=>setAchievement({...achievement,xpReward:v})}/>
        <label className="sm:col-span-2 text-sm font-bold">Descrição
          <textarea value={achievement.description} onChange={e=>setAchievement({...achievement,description:e.target.value})} required rows={3}
            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"/>
        </label>
      </div>
      <button disabled={busy} className="arena-button mt-4 disabled:opacity-50">CRIAR CONQUISTA</button>
    </form>

    {msg&&<div className="arena-panel px-4 py-3 text-sm text-slate-300 xl:col-span-2">{msg}</div>}
  </div>
}

function Field({label,value,set,type='text'}:{label:string;value:string;set:(v:string)=>void;type?:string}){
  return <label className="text-sm font-bold">{label}
    <input type={type} value={value} onChange={e=>set(e.target.value)} required
      className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-emerald-500"/>
  </label>
}
