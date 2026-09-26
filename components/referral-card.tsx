'use client';

import {useEffect,useState} from 'react';

export function ReferralCard({username}:{username:string}){
  const [link,setLink]=useState('');
  const [copied,setCopied]=useState(false);

  useEffect(()=>{
    setLink(location.origin+'/r/'+username);
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

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl bg-white/[.04] p-4">
        <b className="text-sm">Bônus imediato</b>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Quando o convidado fizer o primeiro palpite, você recebe +100 XP e ele recebe +50 XP.
        </p>
      </div>
      <div className="rounded-2xl bg-violet-500/[.06] p-4">
        <b className="text-sm text-violet-300">Marcos premium</b>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Para contar no prêmio premium, o convidado precisa fazer pelo menos 3 palpites em 2 dias diferentes.
        </p>
      </div>
    </div>
  </div>;
}
