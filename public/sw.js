const CACHE='arena-v01-shell';
const OFFLINE='/offline';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll([OFFLINE,'/manifest.webmanifest','/icon.svg'])));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).catch(async()=>{const cached=await caches.match(e.request);return cached||caches.match(OFFLINE);}));});
