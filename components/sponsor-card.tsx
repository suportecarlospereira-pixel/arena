'use client';

import {useEffect,useRef} from 'react';

type Sponsor={
  id:string;
  advertiser_name:string;
  headline:string;
  body:string|null;
  cta_label:string;
  destination_url:string;
  image_url:string|null;
};

export function SponsorCard({
  sponsor,
  placement
}:{
  sponsor:Sponsor;
  placement:string;
}){
  const sent=useRef(false);

  function track(eventType:'impression'|'click'){
    fetch('/api/sponsors/event',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        campaignId:sponsor.id,
        eventType,
        placement
      }),
      keepalive:true
    }).catch(()=>{});
  }

  useEffect(()=>{
    if(sent.current) return;
    sent.current=true;
    track('impression');
  },[]);

  return <aside className="arena-card overflow-hidden border-violet-500/20">
    <div className="grid gap-0 md:grid-cols-[1fr_auto]">
      <div className="p-5">
        <div className="text-[10px] font-black uppercase tracking-[.18em] text-violet-300">Patrocinado • {sponsor.advertiser_name}</div>
        <h3 className="mt-2 text-xl font-black">{sponsor.headline}</h3>
        {sponsor.body&&<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{sponsor.body}</p>}
        <a
          href={sponsor.destination_url}
          target="_blank"
          rel="sponsored noopener noreferrer"
          onClick={()=>track('click')}
          className="arena-button mt-4 inline-flex"
        >
          {sponsor.cta_label}
        </a>
      </div>
      {sponsor.image_url&&<div className="min-h-40 w-full md:w-72">
        <img src={sponsor.image_url} alt="" className="h-full w-full object-cover"/>
      </div>}
    </div>
  </aside>;
}
