'use client';

import { useEffect, useState } from 'react';

export function ReferralCard({username}:{username:string}){
  const [link,setLink]=useState('');
  const [copied,setCopied]=useState(false);

  useEffect(()=>{
    setLink(location.origin + '/r/' + username);
  },[username]);

  async function copy(){
    if(!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(()=>setCopied(false),1600);
  }

  return <div className="arena-card p-5">
    <div className="arena-label">Seu link de indicação</div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input readOnly value={link} className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-300"/>
      <button onClick={copy} className="arena-button">{copied?'COPIADO!':'COPIAR LINK'}</button>
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-500">Quando a pessoa criar a conta por esse link e fizer o primeiro palpite, você recebe +100 XP e ela recebe +50 XP.</p>
  </div>
}
