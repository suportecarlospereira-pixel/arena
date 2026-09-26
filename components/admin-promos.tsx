'use client';

import {useState} from 'react';

type Promo={
  id:string;
  code:string;
  name:string;
  grant_plan:'PRO'|'PRO_PLUS';
  grant_days:number;
  max_redemptions:number|null;
  redemptions:number;
  active:boolean;
  starts_at:string;
  ends_at:string|null;
  created_at:string;
};

export function AdminPromos({initial}:{initial:Promo[]}){
  const [rows,setRows]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const [form,setForm]=useState({
    code:'',
    name:'',
    plan:'PRO' as 'PRO'|'PRO_PLUS',
    days:'7',
    maxRedemptions:'100',
    startsAt:'',
    endsAt:''
  });

  async function create(e:React.FormEvent){
    e.preventDefault();
    setBusy(true);
    setMsg('');

    const r=await fetch('/api/admin/promos',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        action:'create',
        code:form.code,
        name:form.name,
        plan:form.plan,
        days:Number(form.days),
        maxRedemptions:form.maxRedemptions?Number(form.maxRedemptions):null,
        startsAt:form.startsAt||null,
        endsAt:form.endsAt||null
      })
    });
    const j=await r.json();

    if(r.ok){
      setMsg('Cupom criado.');
      setTimeout(()=>location.reload(),350);
    }else{
      setMsg(j.error||'Não foi possível criar o cupom.');
      setBusy(false);
    }
  }

  async function toggle(row:Promo){
    const r=await fetch('/api/admin/promos',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        action:'toggle',
        promoId:row.id,
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
      <div className="arena-label">Novo benefício</div>
      <h3 className="mt-1 text-xl font-black">Criar cupom de trial</h3>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Código" value={form.code} set={v=>setForm({...form,code:v.toUpperCase()})} placeholder="BEMVINDO7"/>
        <Field label="Nome interno" value={form.name} set={v=>setForm({...form,name:v})} placeholder="Campanha lançamento"/>
        <label className="text-sm font-bold">Plano liberado
          <select value={form.plan} onChange={e=>setForm({...form,plan:e.target.value as 'PRO'|'PRO_PLUS'})} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0b0e14] p-3 outline-none focus:border-violet-500">
            <option value="PRO">PRO</option>
            <option value="PRO_PLUS">PRO+</option>
          </select>
        </label>
        <Field label="Dias de acesso" type="number" value={form.days} set={v=>setForm({...form,days:v})} min="1" max="90"/>
        <Field label="Máx. resgates" type="number" value={form.maxRedemptions} set={v=>setForm({...form,maxRedemptions:v})} required={false} min="1"/>
        <Field label="Início (opcional)" type="datetime-local" value={form.startsAt} set={v=>setForm({...form,startsAt:v})} required={false}/>
        <Field label="Fim da campanha (opcional)" type="datetime-local" value={form.endsAt} set={v=>setForm({...form,endsAt:v})} required={false}/>
      </div>

      <button disabled={busy} className="arena-button mt-4 disabled:opacity-50">
        {busy?'CRIANDO...':'CRIAR CUPOM'}
      </button>
      {msg&&<p className="mt-3 text-sm text-slate-400">{msg}</p>}
    </form>

    <div className="arena-card overflow-x-auto">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="p-4">Cupom</th>
            <th>Benefício</th>
            <th>Resgates</th>
            <th>Validade</th>
            <th className="pr-4 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row=><tr key={row.id} className="border-b border-white/5 last:border-0">
            <td className="p-4">
              <b className="block font-mono text-violet-300">{row.code}</b>
              <span className="text-xs text-slate-500">{row.name}</span>
            </td>
            <td>{row.grant_plan==='PRO_PLUS'?'PRO+':'PRO'} • {row.grant_days} dia(s)</td>
            <td>{row.redemptions}/{row.max_redemptions??'∞'}</td>
            <td className="text-xs text-slate-500">{row.ends_at?new Date(row.ends_at).toLocaleString('pt-BR'):'Sem fim'}</td>
            <td className="pr-4 text-right">
              <button onClick={()=>toggle(row)} className={row.active?'rounded-xl border border-emerald-500/20 px-3 py-2 text-xs font-black text-emerald-400':'rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-500'}>
                {row.active?'ATIVO':'INATIVO'}
              </button>
            </td>
          </tr>)}
        </tbody>
      </table>
      {!rows.length&&<div className="p-6 text-sm text-slate-400">Nenhum cupom criado ainda.</div>}
    </div>
  </div>;
}

function Field({
  label,value,set,type='text',placeholder='',required=true,min,max
}:{
  label:string;
  value:string;
  set:(value:string)=>void;
  type?:string;
  placeholder?:string;
  required?:boolean;
  min?:string;
  max?:string;
}){
  return <label className="text-sm font-bold">{label}
    <input
      type={type}
      value={value}
      onChange={e=>set(e.target.value)}
      placeholder={placeholder}
      required={required}
      min={min}
      max={max}
      className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 outline-none focus:border-violet-500"
    />
  </label>;
}
