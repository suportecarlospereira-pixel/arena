'use client';

import {useState} from 'react';

type Campaign={
  id:string;
  advertiser_name:string;
  name:string;
  headline:string;
  destination_url:string;
  placements:string[];
  priority:number;
  active:boolean;
  starts_at:string;
  ends_at:string|null;
  impressions:number;
  clicks:number;
  ctr:number;
};

export function AdminSponsors({initial}:{initial:Campaign[]}){
  const [rows,setRows]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const [form,setForm]=useState({
    advertiserName:'',
    name:'',
    headline:'',
    body:'',
    ctaLabel:'SAIBA MAIS',
    destinationUrl:'',
    imageUrl:'',
    priority:'0',
    startsAt:'',
    endsAt:''
  });

  async function create(e:React.FormEvent){
    e.preventDefault();
    setBusy(true);
    setMsg('');

    const r=await fetch('/api/admin/sponsors',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        action:'create',
        ...form,
        priority:Number(form.priority||0)
      })
    });
    const j=await r.json();

    if(r.ok){
      setMsg('Campanha criada.');
      setTimeout(()=>location.reload(),350);
    }else{
      setMsg(j.error||'Não foi possível criar.');
      setBusy(false);
    }
  }

  async function toggle(row:Campaign){
    setMsg('');
    const r=await fetch('/api/admin/sponsors',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        action:'toggle',
        campaignId:row.id,
        active:!row.active
      })
    });
    const j=await r.json();

    if(r.ok){
      setRows(v=>v.map(x=>x.id===row.id?{...x,active:!x.active}:x));
    }else{
      setMsg(j.error||'Não foi possível atualizar.');
    }
  }

  return <div className="space-y-6">
    <form onSubmit={create} className="arena-card p-5">
      <div className="arena-label">Nova campanha</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Patrocinador" value={form.advertiserName} set={v=>setForm({...form,advertiserName:v})}/>
        <Field label="Nome interno" value={form.name} set={v=>setForm({...form,name:v})}/>
        <label className="text-sm font-bold sm:col-span-2">Headline
          <input value={form.headline} onChange={e=>setForm({...form,headline:e.target.value})} required maxLength={160} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-violet-500"/>
        </label>
        <label className="text-sm font-bold sm:col-span-2">Texto
          <textarea value={form.body} onChange={e=>setForm({...form,body:e.target.value})} rows={3} maxLength={500} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-violet-500"/>
        </label>
        <Field label="CTA" value={form.ctaLabel} set={v=>setForm({...form,ctaLabel:v})}/>
        <Field label="Prioridade" type="number" value={form.priority} set={v=>setForm({...form,priority:v})}/>
        <Field label="URL destino HTTPS" type="url" value={form.destinationUrl} set={v=>setForm({...form,destinationUrl:v})}/>
        <Field label="URL imagem HTTPS (opcional)" type="url" required={false} value={form.imageUrl} set={v=>setForm({...form,imageUrl:v})}/>
        <Field label="Início (opcional)" type="datetime-local" required={false} value={form.startsAt} set={v=>setForm({...form,startsAt:v})}/>
        <Field label="Fim (opcional)" type="datetime-local" required={false} value={form.endsAt} set={v=>setForm({...form,endsAt:v})}/>
      </div>

      <div className="mt-3 rounded-2xl bg-white/[.04] p-3 text-xs text-slate-500">
        Placement inicial: <b className="text-slate-300">Home</b>. O bloco sempre será identificado como “Patrocinado”.
      </div>

      <button disabled={busy} className="arena-button mt-4 disabled:opacity-50">
        {busy?'CRIANDO...':'CRIAR CAMPANHA'}
      </button>
      {msg&&<p className="mt-3 text-sm text-slate-400">{msg}</p>}
    </form>

    <div className="arena-card overflow-x-auto">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="p-4">Campanha</th>
            <th>Impressões</th>
            <th>Cliques</th>
            <th>CTR</th>
            <th>Prioridade</th>
            <th className="pr-4 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row=><tr key={row.id} className="border-b border-white/5 last:border-0">
            <td className="p-4">
              <b className="block">{row.name}</b>
              <span className="text-xs text-slate-500">{row.advertiser_name} • {row.headline}</span>
            </td>
            <td>{Number(row.impressions).toLocaleString('pt-BR')}</td>
            <td>{Number(row.clicks).toLocaleString('pt-BR')}</td>
            <td>{Number(row.ctr).toLocaleString('pt-BR')}%</td>
            <td>{row.priority}</td>
            <td className="pr-4 text-right">
              <button onClick={()=>toggle(row)} className={row.active?'rounded-xl border border-emerald-500/20 px-3 py-2 text-xs font-black text-emerald-400':'rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-500'}>
                {row.active?'ATIVA':'INATIVA'}
              </button>
            </td>
          </tr>)}
        </tbody>
      </table>
      {!rows.length&&<div className="p-6 text-sm text-slate-400">Nenhuma campanha cadastrada.</div>}
    </div>
  </div>;
}

function Field({
  label,value,set,type='text',required=true
}:{
  label:string;
  value:string;
  set:(value:string)=>void;
  type?:string;
  required?:boolean;
}){
  return <label className="text-sm font-bold">{label}
    <input type={type} value={value} onChange={e=>set(e.target.value)} required={required} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-violet-500"/>
  </label>;
}
