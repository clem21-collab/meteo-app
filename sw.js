const CACHE='meteo-v5-wind-field-2-dashboard-12';
const LOCAL_ASSETS=['./','./index.html','./privacy.html','./style.css?v=3.1','./app.js?v=3.4.1','./forecast48.js?v=3','./forecast48.css?v=3','./dashboard.css?v=2','./journal.css?v=12','./journal.js?v=3','./journal-landscape.webp','./push-client.js?v=2.9','./v34.js?v=3.4.1','./v34.css','./v35.js?v=3.5.2','./v35.css','./v36.js?v=3.6.2','./v36.css?v=3.6','./v37.js?v=3.7.1','./v37.css','./v38.js?v=3.9.1','./v38.css','./v40.js?v=4.0','./v41.js?v=4.1','./v41.css','./v42.js?v=4.2','./v42.css','./v43.js?v=4.3','./v43.css','./v44.js?v=4.4','./v44.css','./v45.js?v=4.5.6','./v45.css','./v46.js?v=4.6.1','./v46.css','./v50.js?v=5.0.8','./v50.css','./v50-patch.js?v=5.0.2','./v50-runtime.js?v=5.0.3','./v50-extra.js?v=5.0.2','./v50-premium-gates.js?v=5.0.3','./v50-radar-layers.js?v=5.0.9','./manifest.webmanifest','./icon.svg','./icon.svg?v=2'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(LOCAL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('meteo-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||event.request.headers.has('Authorization'))return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
    if(!response.ok)return response;
    const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;
  }).catch(()=>caches.match(event.request)));
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={body:event.data?event.data.text():''};}
  const title=data.title||'Météo';
  const options={body:data.body||'Nouvelle alerte météo.',icon:data.icon||'./icon.svg?v=2',badge:'./icon.svg?v=2',tag:data.tag||'meteo-push',renotify:false,data:data.data||{url:'./?tab=alerts'}};
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const data=event.notification?.data||{};
  const target=data.url||((data.tab)?`./?tab=${data.tab}`:'./');
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){if('focus'in client){try{client.navigate(target);}catch{}return client.focus();}}
    if(clients.openWindow)return clients.openWindow(target);
  }));
});
