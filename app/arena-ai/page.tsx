'use client';

import { useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';

type Msg={role:'user'|'assistant';text:string};

const suggestions=[
  'Como está meu desempenho?',
  'Qual é o top 5 do ranking?',
  'Como está meu time favorito?',
  'Compare Flamengo e Palmeiras'
];

export default function ArenaAI(){
  const [q,setQ]=useState('');
  const [busy,setBusy]=useState(false);
  const [msgs,setMsgs]=useState<Msg[]>([
    {
      role:'assistant',
      text:'Sou a Arena AI. Uso os dados reais armazenados na plataforma para analisar seu desempenho, ranking, clubes e próximos jogos — sem inventar números.'
    }
  ]);

  async function send(value?:string){
    const text=(value??q).trim();
    if(!text||busy) return;

    setQ('');
    setMsgs(v=>[...v,{role:'user',text}]);
    setBusy(true);

    try{
      const r=await fetch('/api/arena-ai',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({question:text})
      });
      const j=await r.json();
      setMsgs(v=>[
        ...v,
        {role:'assistant',text:j.answer||j.error||'Não consegui responder.'}
      ]);
    }finally{
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-3xl">
    <div className="mb-5 flex items-center gap-3">
      <span className="rounded-2xl bg-sky-500/15 p-3 text-sky-400"><Bot/></span>
      <div>
        <div className="arena-label">Inteligência da Arena</div>
        <h1 className="text-2xl font-black">Arena AI</h1>
      </div>
    </div>

    <div className="mb-4 flex gap-2 overflow-auto pb-1">
      {suggestions.map(s=>
        <button
          key={s}
          onClick={()=>send(s)}
          className="whitespace-nowrap rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-400 hover:text-white"
        >
          {s}
        </button>
      )}
    </div>

    <div className="arena-card flex min-h-[62vh] flex-col p-4 sm:p-5">
      <div className="flex-1 space-y-4 overflow-auto">
        {msgs.map((m,i)=>
          <div key={i} className={'flex '+(m.role==='user'?'justify-end':'justify-start')}>
            <div className={
              'max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 '+
              (m.role==='user'
                ?'bg-emerald-500 font-semibold text-slate-950'
                :'bg-white/[.06] text-slate-300')
            }>
              {m.role==='assistant'&&<Sparkles size={14} className="mb-1 inline text-sky-400"/>}
              {' '}{m.text}
            </div>
          </div>
        )}
        {busy&&<div className="text-sm text-slate-500">Consultando a Arena...</div>}
      </div>

      <div className="mt-4 flex gap-2 border-t border-white/10 pt-4">
        <textarea
          rows={2}
          value={q}
          onChange={e=>setQ(e.target.value)}
          onKeyDown={e=>{
            if(e.key==='Enter'&&!e.shiftKey){
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ex.: Como está meu time favorito?"
          className="min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-sky-500"
        />
        <button
          disabled={busy}
          onClick={()=>send()}
          className="grid w-12 place-items-center rounded-2xl bg-sky-500 text-slate-950 disabled:opacity-50"
        >
          <Send size={19}/>
        </button>
      </div>
    </div>
  </div>;
}
