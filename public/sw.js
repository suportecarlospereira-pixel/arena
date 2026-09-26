const CACHE='arena-shell-v2';
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
    event.respondWith(
      fetch(request).catch(()=>caches.match('/offline'))
    );
    return;
  }

  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')) return;

  if(PRECACHE.includes(url.pathname)){
    event.respondWith(
      caches.match(request).then((cached)=>cached||fetch(request))
    );
  }
});
