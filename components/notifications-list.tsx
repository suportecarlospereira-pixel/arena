'use client';

import { useState } from 'react';

type Notification={id:string;title:string;body:string;type:string;read_at:string|null;created_at:string};

export function NotificationsList({initial}:{initial:Notification[]}){
  const [items,setItems]=useState(initial);
  const unread=items.filter(x=>!x.read_at).length;

  async function markAll(){
    const r=await fetch('/api/notifications/read',{method:'PATCH'});
    if(r.ok){
      const now=new Date().toISOString();
      setItems(v=>v.map(x=>({...x,read_at:x.read_at||now})));
    }
  }

  return <div>
    {unread>0&&<div className="mb-4 flex justify-end"><button onClick={markAll} className="arena-button-secondary text-sm">Marcar todas como lidas</button></div>}
    <div className="space-y-3">
      {items.map(n=><div key={n.id} className={`arena-card p-4 ${!n.read_at?'border-emerald-500/30':''}`}>
        <div className="flex items-start justify-between gap-3">
          <div><b>{n.title}</b><p className="mt-1 text-sm leading-6 text-slate-400">{n.body}</p></div>
          {!n.read_at&&<span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400"/>}
        </div>
        <div className="mt-3 text-[11px] text-slate-600">{new Date(n.created_at).toLocaleString('pt-BR')}</div>
      </div>)}
      {!items.length&&<div className="arena-card p-6 text-sm text-slate-400">Nenhuma notificação.</div>}
    </div>
  </div>
}
