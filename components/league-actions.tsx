'use client';
import {useState} from 'react';
export function LeagueActions({leagueId,inviteCode,canLeave}:{leagueId:string;inviteCode:string;canLeave:boolean}){
 const [msg,setMsg]=useState('');
 async function copy(){await navigator.clipboard.writeText(inviteCode);setMsg('Código copiado.');setTimeout(()=>setMsg(''),1500);}
 async function leave(){if(!confirm('Sair desta liga?'))return;const r=await fetch('/api/leagues',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'leave',leagueId})});const j=await r.json();if(r.ok)location.href='/ligas';else setMsg(j.error||'Não foi possível sair.');}
 return <div className="flex flex-wrap items-center gap-2"><button onClick={copy} className="arena-button-secondary">COPIAR CÓDIGO</button>{canLeave&&<button onClick={leave} className="rounded-2xl border border-red-500/20 px-4 py-3 text-sm font-bold text-red-400">SAIR DA LIGA</button>}{msg&&<span className="text-xs text-slate-500">{msg}</span>}</div>
}