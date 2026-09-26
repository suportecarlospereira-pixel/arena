const CACHE='arena-shell-v3';
const PRECACHE=['/offline','/manifest.webmanifest','/icon.svg'];

self.addEventListener('install',(event)=>{
  event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate',(event)=>{
  event.waitUntil(
    caches.keys()
      .then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',(event)=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);

  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match('/offline')));
    return;
  }

  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')) return;

  if(PRECACHE.includes(url.pathname)){
    event.respondWith(caches.match(request).then((cached)=>cached||fetch(request)));
  }
});

self.addEventListener('push',(event)=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{data={body:event.data?event.data.text():''}}

  const title=data.title||'ARENA';
  const target=typeof data.url==='string'&&data.url.startsWith('/')?data.url:'/notificacoes';

  event.waitUntil(self.registration.showNotification(title,{
    body:data.body||'Você tem uma nova atualização na Arena.',
    icon:data.icon||'/icon.svg',
    badge:data.badge||'/icon.svg',
    tag:data.tag||'arena-notification',
    data:{url:target},
    renotify:true
  }));
});

self.addEventListener('notificationclick',(event)=>{
  event.notification.close();
  const target=event.notification?.data?.url||'/notificacoes';

  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus' in client){
        if('navigate' in client) await client.navigate(target);
        return client.focus();
      }
    }
    if(self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
