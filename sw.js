const CACHE='meteo-v4-6-shell';
const LOCAL_ASSETS=['./','./index.html','./style.css','./app.js','./push-client.js','./v34.js','./v34.css','./v35.js','./v35.css','./v36.js','./v36.css','./v37.js','./v37.css','./v38.js','./v38.css','./v40.js','./v41.js','./v41.css','./v42.js','./v42.css','./v43.js','./v43.css','./v44.js','./v44.css','./v45.js','./v45.css','./v46.js','./v46.css','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(LOCAL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
    const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;
  }).catch(()=>caches.match(event.request)));
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={body:event.data?event.data.text():''};}
  const title=data.title||'Météo';
  const options={body:data.body||'Nouvelle alerte météo.',icon:data.icon||'./icon.svg',badge:'./icon.svg',tag:data.tag||'meteo-push',renotify:false,data:data.data||{url:'./?tab=alerts'}};
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