'use client';
import {useState} from 'react';
export function FollowButton({username,initialFollowing}:{username:string;initialFollowing:boolean}){
 const [following,setFollowing]=useState(initialFollowing); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
 async function toggle(){setBusy(true);setMsg('');const r=await fetch('/api/social/follow',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,follow:!following})});const j=await r.json();if(r.ok)setFollowing(!following);else setMsg(j.error||'Não foi possível atualizar.');setBusy(false);}
 return <div className="text-right"><button disabled={busy} onClick={toggle} className={following?'arena-button-secondary':'arena-button'}>{busy?'SALVANDO...':following?'SEGUINDO':'SEGUIR'}</button>{msg&&<div className="mt-2 text-xs text-red-400">{msg}</div>}</div>
}