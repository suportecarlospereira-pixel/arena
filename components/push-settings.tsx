'use client';

import {useEffect,useState} from 'react';

function urlBase64ToUint8Array(value:string){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

export function PushSettings(){
  const [supported,setSupported]=useState(true);
  const [enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  useEffect(()=>{
    let active=true;
    (async()=>{
      const ok='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if(!active)return;
      setSupported(ok);
      if(!ok)return;
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(active)setEnabled(Boolean(sub));
    })().catch(()=>{if(active)setSupported(false)});
    return()=>{active=false};
  },[]);

  async function enable(){
    setBusy(true);setMsg('');
    try{
      if(Notification.permission==='denied') throw new Error('As notificações estão bloqueadas nas configurações do navegador.');
      const permission=await Notification.requestPermission();
      if(permission!=='granted') throw new Error('Permissão de notificação não concedida.');

      const keyResponse=await fetch('/api/push/key',{cache:'no-store'});
      const keyJson=await keyResponse.json();
      if(!keyResponse.ok||!keyJson.publicKey) throw new Error('Não foi possível carregar a chave de push.');

      const reg=await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub){
        sub=await reg.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:urlBase64ToUint8Array(keyJson.publicKey)
        });
      }

      const json=sub.toJSON();
      const r=await fetch('/api/push/subscription',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          endpoint:sub.endpoint,
          p256dh:json.keys?.p256dh,
          auth:json.keys?.auth
        })
      });
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'Não foi possível ativar o push.');

      setEnabled(true);
      setMsg('Push ativado neste dispositivo.');
    }catch(e){
      setMsg(e instanceof Error?e.message:'Não foi possível ativar.');
    }finally{
      setBusy(false);
    }
  }

  async function disable(){
    setBusy(true);setMsg('');
    try{
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(sub){
        await fetch('/api/push/subscription',{
          method:'DELETE',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({endpoint:sub.endpoint})
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      setMsg('Push desativado neste dispositivo.');
    }catch{
      setMsg('Não foi possível desativar agora.');
    }finally{
      setBusy(false);
    }
  }

  if(!supported){
    return <div className="arena-card mb-5 p-5">
      <div className="arena-label">Push</div>
      <p className="mt-2 text-sm text-slate-400">Este navegador não oferece Web Push neste modo. Em iPhone, instale o ARENA na Tela de Início e abra pelo ícone do app.</p>
    </div>;
  }

  return <div className="arena-card mb-5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="arena-label">Notificações push</div>
        <h3 className="mt-1 font-black">{enabled?'Ativadas neste dispositivo':'Receba alertas mesmo fora do ARENA'}</h3>
        <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Resultados dos seus palpites, eventos sociais e lembrete antes do jogo do seu time favorito quando você ainda não palpitou.</p>
      </div>
      <button disabled={busy} onClick={enabled?disable:enable} className={enabled?'arena-button-secondary':'arena-button'}>
        {busy?'AGUARDE...':enabled?'DESATIVAR PUSH':'ATIVAR PUSH'}
      </button>
    </div>
    {msg&&<p className="mt-3 text-xs text-slate-400">{msg}</p>}
  </div>
}
