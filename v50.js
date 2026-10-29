const V50_VERSION='5.0';
const V50_SETTINGS_KEY='meteo-app-v50-settings-v1';
const V50_OFFLINE_KEY='meteo-app-offline-weather-v1';
const V50_COMPARE_KEY='meteo-app-compare-v1';
const V50_STATS_URL='https://historical-forecast-api.open-meteo.com/v1/forecast';
let v50StatsAll=null;
let v50StatsKey='';
let v50StormLayer=null;
let v50OriginalShowRadarFrame=null;
let v50OriginalSyncPush=null;
let v50PlaceTimer=null;

(function initV50(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v50.css?v=${V50_VERSION}`;document.head.appendChild(css);
  const boot=()=>{
    if(!document.getElementById('panel-weather')||typeof currentPlace==='undefined')return setTimeout(boot,250);
    document.documentElement.dataset.meteoVersion=V50_VERSION;
    injectV50Navigation();
    injectV50TodayPanel();
    injectV50ComparePanel();
    injectV50SettingsPanel();
    injectV50CompactView();
    injectV50OfflineBanner();
    enhanceV50Radar();
    enhanceV50Stats();
    patchV50PushSettings();
    bindV50PlaceObserver();
    bindV50OnlineState();
    applyV50Settings();
    saveV50OfflineSnapshot();
    if(!navigator.onLine)restoreV50OfflineSnapshot();
    setTimeout(()=>{renderV50Today();renderV50CompareChoices();refreshV50RadarRisk();},500);
    const q=new URLSearchParams(location.search),tab=q.get('tab');
    if(['today','compare','settings'].includes(tab))setTimeout(()=>switchV50Tab(tab),700);
  };
  boot();
})();

function defaultV50Settings(){
  return{
    theme:'auto',compact:false,animations:true,radarSnow:true,
    frost:true,frostThreshold:0,heat:true,heatThreshold:30,
    smartWind:true,smartStorm:true,smartLeadHours:6,
    quiet:false,quietStart:'22:00',quietEnd:'07:00'
  };
}
function readV50Settings(){
  try{return{...defaultV50Settings(),...JSON.parse(localStorage.getItem(V50_SETTINGS_KEY)||'{}')}}catch{return defaultV50Settings();}
}
function saveV50Settings(patch){
  const next={...readV50Settings(),...patch};
  try{localStorage.setItem(V50_SETTINGS_KEY,JSON.stringify(next));}catch{}
  return next;
}
function v50PlaceKey(){
  if(typeof currentPlace==='undefined'||!currentPlace)return'';
  return`${Number(currentPlace.latitude).toFixed(4)},${Number(currentPlace.longitude).toFixed(4)}`;
}
function escV50(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ===== Navigation V5 =====
function injectV50Navigation(){
  const tabs=document.querySelector('.tabs');
  if(tabs&&!tabs.querySelector('[data-tab="today"]')){
    const b=document.createElement('button');b.className='tab';b.type='button';b.dataset.tab='today';b.textContent='Aujourd’hui';
    tabs.insertBefore(b,tabs.firstElementChild);b.addEventListener('click',()=>switchV50Tab('today'));
  }
  if(tabs&&!tabs.querySelector('[data-tab="compare"]')){
    const b=document.createElement('button');b.className='tab';b.type='button';b.dataset.tab='compare';b.textContent='Comparer';
    const fav=tabs.querySelector('[data-tab="favorites"]');tabs.insertBefore(b,fav||null);b.addEventListener('click',()=>switchV50Tab('compare'));
  }
  if(tabs&&!tabs.querySelector('[data-tab="settings"]')){
    const b=document.createElement('button');b.className='tab';b.type='button';b.dataset.tab='settings';b.textContent='Réglages';
    tabs.appendChild(b);b.addEventListener('click',()=>switchV50Tab('settings'));
  }

  const mobile=document.querySelector('.mobile-bottom-nav');
  if(mobile&&!mobile.querySelector('[data-mobile-tab="today"]')){
    const b=document.createElement('button');b.type='button';b.dataset.mobileTab='today';b.innerHTML='<span>🗓️</span><small>Aujourd’hui</small>';
    mobile.insertBefore(b,mobile.firstElementChild);b.addEventListener('click',()=>switchV50Tab('today'));
  }
  mobile?.classList.add('v50-scroll-nav');

  const actions=document.querySelector('.top-actions');
  if(actions&&!document.getElementById('v50SettingsShortcut')){
    const b=document.createElement('button');b.id='v50SettingsShortcut';b.type='button';b.className='round-button';b.title='Réglages';b.setAttribute('aria-label','Réglages');b.textContent='⚙';
    actions.appendChild(b);b.addEventListener('click',()=>switchV50Tab('settings'));
  }
  if(actions&&!document.getElementById('v50CompactShortcut')){
    const b=document.createElement('button');b.id='v50CompactShortcut';b.type='button';b.className='round-button';b.title='Vue compacte';b.setAttribute('aria-label','Vue météo compacte');b.textContent='▣';
    actions.appendChild(b);b.addEventListener('click',openV50Compact);
  }
}
function switchV50Tab(name){
  document.querySelectorAll('.tab-panel').forEach(p=>{const on=p.id===`panel-${name}`;p.hidden=!on;p.classList.toggle('active',on);});
  document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.mobile-bottom-nav [data-mobile-tab]').forEach(b=>b.classList.toggle('active',b.dataset.mobileTab===name));
  if(name==='today')renderV50Today();
  if(name==='compare'){renderV50CompareChoices();refreshV50Compare();}
  if(name==='settings')syncV50SettingsUi();
  if(name==='stats')refreshV50LongStats(30);
  if(name==='radar')setTimeout(()=>{try{showUnifiedRadar?.();refreshV50RadarRisk();}catch{}},150);
  try{history.replaceState(null,'',name==='weather'?location.pathname:`?tab=${name}`);}catch{}
  window.scrollTo({top:0,behavior:'smooth'});
}

// ===== Aujourd'hui =====
function injectV50TodayPanel(){
  if(document.getElementById('panel-today'))return;
  const panel=document.createElement('section');panel.id='panel-today';panel.className='tab-panel v50-today-panel';panel.hidden=true;
  panel.innerHTML=`
    <div class="v50-page-head"><div><span class="section-label">VUE DU JOUR</span><h2>Aujourd’hui</h2><p class="muted" id="v50TodaySubtitle">Matin → nuit, en un coup d’œil.</p></div><button id="v50TodayToWeather" class="secondary-button" type="button">Voir la météo complète</button></div>
    <section id="v50TodayHero" class="v50-today-hero glass-card"><div class="empty-state">Chargement du résumé…</div></section>
    <section class="section"><div class="section-heading"><div><h2>La journée heure par heure</h2><p class="muted">Les grands moments de la journée</p></div></div><div id="v50DayParts" class="v50-day-parts"></div></section>
    <section class="section"><div class="section-heading"><div><h2>À surveiller</h2><p class="muted">Pluie, vent, froid et orages dans les prochaines heures</p></div></div><div id="v50TodayRisks" class="v50-risk-grid"></div></section>`;
  document.getElementById('panel-weather')?.insertAdjacentElement('beforebegin',panel);
  document.getElementById('v50TodayToWeather')?.addEventListener('click',()=>switchV50Tab('weather'));
}
function v50HourlyIndexFor(hourly,date,hour){
  const target=`${date}T${String(hour).padStart(2,'0')}:00`,times=hourly?.time||[];
  let i=times.indexOf(target);if(i>=0)return i;
  const targetMs=new Date(target).getTime();let best=-1,diff=Infinity;
  times.forEach((t,j)=>{if(!String(t).startsWith(date))return;const d=Math.abs(new Date(t).getTime()-targetMs);if(d<diff){diff=d;best=j;}});return best;
}
function v50MomentAdvice(h,i){
  const rain=Number(h.precipitation_probability?.[i]||0),precip=Number(h.precipitation?.[i]||0),wind=Number(h.wind_gusts_10m?.[i]||0),temp=Number(h.temperature_2m?.[i]);
  if(rain>=70||precip>=1)return'Parapluie conseillé';
  if(wind>=60)return'Rafales à surveiller';
  if(Number.isFinite(temp)&&temp<=3)return'Prévoir une couche chaude';
  if(Number.isFinite(temp)&&temp>=28)return'Il fera chaud';
  return'Conditions plutôt calmes';
}
async function renderV50Today(){
  const hero=document.getElementById('v50TodayHero'),parts=document.getElementById('v50DayParts'),risks=document.getElementById('v50TodayRisks');
  if(!hero||!parts||!risks||typeof currentPlace==='undefined'||!currentPlace)return;
  hero.innerHTML='<div class="empty-state">Analyse de la journée…</div>';
  try{
    let hd=null,dd=null;
    if(typeof fetchV42HourlyDetails==='function')hd=await fetchV42HourlyDetails(false);
    if(typeof fetchV43DailyDetails==='function')dd=await fetchV43DailyDetails(false);
    const h=hd?.hourly,d=dd?.daily;
    if(!h?.time?.length)throw new Error('Données horaires indisponibles');
    const date=String(currentData?.current?.time||h.time[0]).slice(0,10),nowI=v50HourlyIndexFor(h,date,new Date().getHours());
    const currentI=nowI>=0?nowI:0,[icon,label]=typeof weatherInfo==='function'?weatherInfo(Number(h.weather_code?.[currentI]),Number(currentData?.current?.is_day??1)):['🌤️','Conditions variables'];
    const min=Number(d?.temperature_2m_min?.[0]??currentData?.daily?.temperature_2m_min?.[0]),max=Number(d?.temperature_2m_max?.[0]??currentData?.daily?.temperature_2m_max?.[0]),rainMax=Number(d?.precipitation_probability_max?.[0]??currentData?.daily?.precipitation_probability_max?.[0]);
    hero.innerHTML=`<div class="v50-today-main"><div class="v50-today-icon">${icon}</div><div><span class="section-label">${escV50(currentPlace.name)}</span><h2>${label}</h2><p>${Number.isFinite(min)?Math.round(min):'--'}° → ${Number.isFinite(max)?Math.round(max):'--'}° • risque de pluie max ${Number.isFinite(rainMax)?Math.round(rainMax):'--'} %</p></div></div><div class="v50-today-now"><span>Maintenant</span><strong>${Number.isFinite(Number(h.temperature_2m?.[currentI]))?Math.round(Number(h.temperature_2m[currentI])):'--'}°</strong><small>Ressenti ${Number.isFinite(Number(h.apparent_temperature?.[currentI]))?Math.round(Number(h.apparent_temperature[currentI])):'--'}°</small></div>`;
    const defs=[['Matin',8,'🌅'],['Midi',12,'☀️'],['Après-midi',16,'🌤️'],['Soirée',20,'🌆'],['Nuit',23,'🌙']];
    parts.innerHTML=defs.map(([name,hour,emoji])=>{
      const i=v50HourlyIndexFor(h,date,hour);if(i<0)return'';const wi=typeof weatherInfo==='function'?weatherInfo(Number(h.weather_code?.[i]),hour>=7&&hour<20?1:0):[emoji,''];
      return`<article class="glass-card v50-day-part"><span class="v50-part-time">${name}<small>${String(hour).padStart(2,'0')}:00</small></span><b class="v50-part-icon">${wi[0]||emoji}</b><strong>${Math.round(Number(h.temperature_2m?.[i]||0))}°</strong><span>💧 ${Math.round(Number(h.precipitation_probability?.[i]||0))}%</span><span>💨 ${Math.round(Number(h.wind_speed_10m?.[i]||0))} km/h</span><small>${v50MomentAdvice(h,i)}</small></article>`;
    }).join('');
    renderV50Risks(h,date,currentI);
    const sub=document.getElementById('v50TodaySubtitle');if(sub)sub.textContent=`${currentPlace.name} • prévisions du ${new Intl.DateTimeFormat('fr-FR',{dateStyle:'full'}).format(new Date(`${date}T12:00:00`))}`;
  }catch(error){console.error('V5 today',error);hero.innerHTML='<div class="empty-state">Impossible de charger la vue Aujourd’hui pour le moment.</div>';}
}
function renderV50Risks(h,date,start){
  const box=document.getElementById('v50TodayRisks');if(!box)return;
  const end=Math.min((start>=0?start:0)+12,h.time.length),slice=(key)=>((h[key]||[]).slice(start,end).map(Number));
  const rain=Math.max(0,...slice('precipitation_probability').filter(Number.isFinite)),gust=Math.max(0,...slice('wind_gusts_10m').filter(Number.isFinite)),temps=slice('temperature_2m').filter(Number.isFinite),min=temps.length?Math.min(...temps):NaN,codes=(h.weather_code||[]).slice(start,end).map(Number),storm=codes.some(c=>[95,96,99].includes(c));
  const items=[
    ['🌧️','Pluie',`${Math.round(rain)} %`,rain>=70?'Risque élevé':rain>=40?'Risque modéré':'Risque faible',rain>=70?'high':rain>=40?'medium':'low'],
    ['💨','Rafales',`${Math.round(gust)} km/h`,gust>=60?'Vent fort possible':gust>=40?'Quelques rafales':'Vent modéré',gust>=60?'high':gust>=40?'medium':'low'],
    ['❄️','Froid',Number.isFinite(min)?`${Math.round(min)}°`:'--',Number.isFinite(min)&&min<=0?'Gel possible':'Pas de gel marqué',Number.isFinite(min)&&min<=0?'high':'low'],
    ['⛈️','Orages',storm?'Possible':'Non détecté',storm?'Signal orageux dans les 12 h':'Aucun code orage dans les 12 h',storm?'high':'low']
  ];
  box.innerHTML=items.map(([e,t,v,d,l])=>`<article class="glass-card v50-risk" data-level="${l}"><span>${e}</span><div><small>${t}</small><strong>${v}</strong><p>${d}</p></div></article>`).join('');
}

// ===== Comparaison de villes =====
function injectV50ComparePanel(){
  if(document.getElementById('panel-compare'))return;
  const panel=document.createElement('section');panel.id='panel-compare';panel.className='tab-panel v50-compare-panel';panel.hidden=true;
  panel.innerHTML=`<div class="v50-page-head"><div><span class="section-label">COMPARER</span><h2>Comparer mes villes</h2><p class="muted">Choisis jusqu’à 3 villes parmi ta position et tes favoris.</p></div><button id="v50CompareRefresh" class="secondary-button" type="button">↻ Actualiser</button></div><div id="v50CompareChoices" class="v50-compare-choices"></div><div id="v50CompareCards" class="v50-compare-cards"></div><div id="v50CompareTable" class="glass-card v50-compare-table"></div>`;
  document.getElementById('panel-radar')?.insertAdjacentElement('beforebegin',panel);
  document.getElementById('v50CompareRefresh')?.addEventListener('click',()=>refreshV50Compare(true));
}
function v50AvailableComparePlaces(){
  const list=[];
  if(typeof currentPlace!=='undefined'&&currentPlace)list.push({...currentPlace,_current:true});
  try{if(typeof loadFavorites==='function')list.push(...loadFavorites());}catch{}
  const seen=new Set();return list.filter(p=>{const k=`${Number(p.latitude).toFixed(4)},${Number(p.longitude).toFixed(4)}`;if(seen.has(k))return false;seen.add(k);p._v50key=k;return true;});
}
function readV50CompareSelection(places){
  let saved=[];try{saved=JSON.parse(localStorage.getItem(V50_COMPARE_KEY)||'[]');}catch{}
  const keys=new Set(places.map(p=>p._v50key));saved=(Array.isArray(saved)?saved:[]).filter(k=>keys.has(k)).slice(0,3);
  if(saved.length<2)saved=places.slice(0,Math.min(3,places.length)).map(p=>p._v50key);
  return saved;
}
function renderV50CompareChoices(){
  const box=document.getElementById('v50CompareChoices');if(!box)return;const places=v50AvailableComparePlaces(),selected=readV50CompareSelection(places);
  if(!places.length){box.innerHTML='<div class="empty-state">Ajoute des villes aux favoris pour les comparer.</div>';return;}
  box.innerHTML=places.map(p=>`<button type="button" class="v50-city-chip ${selected.includes(p._v50key)?'active':''}" data-key="${p._v50key}">${p._current?'⌖ ':''}${escV50(p.name)}</button>`).join('');
  box.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    let next=readV50CompareSelection(places),k=b.dataset.key;
    if(next.includes(k))next=next.filter(x=>x!==k);else if(next.length<3)next.push(k);else{if(typeof setStatus==='function')setStatus('Tu peux comparer au maximum 3 villes.',true);return;}
    localStorage.setItem(V50_COMPARE_KEY,JSON.stringify(next));renderV50CompareChoices();refreshV50Compare(true);
  }));
}
async function fetchV50ComparePlace(p){
  if(p._current&&typeof currentData!=='undefined'&&currentData){return{place:p,data:currentData};}
  const u=new URL('https://api.open-meteo.com/v1/forecast');u.searchParams.set('latitude',p.latitude);u.searchParams.set('longitude',p.longitude);u.searchParams.set('timezone','auto');u.searchParams.set('forecast_days','2');u.searchParams.set('current','temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m');u.searchParams.set('daily','temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum');
  const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(`Météo indisponible pour ${p.name}`);return{place:p,data:await r.json()};
}
async function refreshV50Compare(force=false){
  const cards=document.getElementById('v50CompareCards'),table=document.getElementById('v50CompareTable');if(!cards||!table)return;
  const places=v50AvailableComparePlaces(),sel=readV50CompareSelection(places),chosen=sel.map(k=>places.find(p=>p._v50key===k)).filter(Boolean);
  if(chosen.length<2){cards.innerHTML='<div class="empty-state">Sélectionne au moins 2 villes.</div>';table.innerHTML='';return;}
  cards.innerHTML='<div class="empty-state">Comparaison en cours…</div>';
  try{
    const rows=await Promise.all(chosen.map(fetchV50ComparePlace));
    cards.innerHTML=rows.map(({place,data})=>{const c=data.current||{},d=data.daily||{},wi=typeof weatherInfo==='function'?weatherInfo(Number(c.weather_code),1):['🌤️',''];return`<article class="glass-card v50-compare-card"><div><span>${wi[0]}</span><h3>${escV50(place.name)}</h3><small>${wi[1]}</small></div><strong>${Math.round(Number(c.temperature_2m||0))}°</strong><p>${Math.round(Number(d.temperature_2m_min?.[0]||0))}° → ${Math.round(Number(d.temperature_2m_max?.[0]||0))}°</p><p>💧 ${Math.round(Number(d.precipitation_probability_max?.[0]||0))}% • ${Number(d.precipitation_sum?.[0]||0).toFixed(1)} mm</p><p>💨 ${Math.round(Number(c.wind_speed_10m||0))} km/h • rafales ${Math.round(Number(c.wind_gusts_10m||0))}</p></article>`;}).join('');
    const metrics=[['Temp. maintenant',r=>`${Math.round(Number(r.data.current?.temperature_2m||0))}°`],['Mini / maxi',r=>`${Math.round(Number(r.data.daily?.temperature_2m_min?.[0]||0))}° / ${Math.round(Number(r.data.daily?.temperature_2m_max?.[0]||0))}°`],['Risque pluie',r=>`${Math.round(Number(r.data.daily?.precipitation_probability_max?.[0]||0))} %`],['Pluie prévue',r=>`${Number(r.data.daily?.precipitation_sum?.[0]||0).toFixed(1)} mm`],['Vent',r=>`${Math.round(Number(r.data.current?.wind_speed_10m||0))} km/h`],['Rafales',r=>`${Math.round(Number(r.data.current?.wind_gusts_10m||0))} km/h`]];
    table.innerHTML=`<div class="v50-compare-table-scroll"><table><thead><tr><th>Mesure</th>${rows.map(r=>`<th>${escV50(r.place.name)}</th>`).join('')}</tr></thead><tbody>${metrics.map(([name,fn])=>`<tr><th>${name}</th>${rows.map(r=>`<td>${fn(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }catch(error){console.error('V5 compare',error);cards.innerHTML='<div class="empty-state">Impossible de charger la comparaison.</div>';}
}

// ===== Radar =====
function enhanceV50Radar(){
  const panel=document.getElementById('panel-radar');if(!panel||document.getElementById('v50RadarModes'))return;
  const toolbar=document.createElement('div');toolbar.id='v50RadarModes';toolbar.className='v50-radar-modes glass-card';
  toolbar.innerHTML=`<div><strong>Affichage radar</strong><small>La neige colorée concerne les observations RainViewer.</small></div><div class="v50-radar-buttons"><button type="button" data-radar-mode="rain">🌧️ Pluie</button><button type="button" data-radar-mode="snow">🌨️ Pluie + neige</button><button type="button" data-radar-mode="storm">⛈️ Orages prévus</button><button type="button" id="v50RadarCenter">⌖ Recentrer</button></div><div id="v50RadarStorm" class="v50-radar-storm">Analyse du risque orageux local…</div><div class="v50-radar-legend"><span>Faible</span><i></i><span>Modérée</span><i></i><span>Forte</span><i></i><span>Très forte</span></div>`;
  const existing=document.querySelector('.radar-v34-toolbar');(existing||panel.querySelector('.radar-card'))?.insertAdjacentElement('afterend',toolbar);
  v50OriginalShowRadarFrame=typeof showRadarFrame==='function'?showRadarFrame:null;
  try{showRadarFrame=v50ShowRadarFrame;}catch{}
  toolbar.querySelectorAll('[data-radar-mode]').forEach(b=>b.addEventListener('click',async()=>{
    const mode=b.dataset.radarMode,s=saveV50Settings({radarSnow:mode!=='rain'});syncV50RadarButtons();
    if(mode==='storm')await showV50StormOnMap();else{removeV50StormLayer();try{const i=Number(document.getElementById('radarSlider')?.value||0),host=document.getElementById('radarSlider')?.dataset.host||v36Host;v50ShowRadarFrame(i,host);applyUnifiedOpacity?.();}catch{}}
  }));
  document.getElementById('v50RadarCenter')?.addEventListener('click',()=>{try{if(map&&currentPlace){map.setView([currentPlace.latitude,currentPlace.longitude],9);marker?.setLatLng?.([currentPlace.latitude,currentPlace.longitude]);}}catch{}});
  syncV50RadarButtons();
}
function syncV50RadarButtons(){
  const snow=readV50Settings().radarSnow;document.querySelectorAll('#v50RadarModes [data-radar-mode]').forEach(b=>b.classList.toggle('active',b.dataset.radarMode===(snow?'snow':'rain')));
}
function v50ShowRadarFrame(i,host){
  if(typeof map==='undefined'||!map||typeof radarFrames==='undefined'||!radarFrames?.length||!window.L)return v50OriginalShowRadarFrame?.(i,host);
  i=Math.max(0,Math.min(Number(i)||0,radarFrames.length-1));const f=radarFrames[i],snow=readV50Settings().radarSnow?1:0;
  try{if(radarLayer)map.removeLayer(radarLayer);}catch{}
  radarLayer=L.tileLayer(`${host}${f.path}/256/{z}/{x}/{y}/2/1_${snow}.png`,{tileSize:256,opacity:Number(document.getElementById('radarOpacityV34')?.value||68)/100,maxNativeZoom:7,maxZoom:10});radarLayer.addTo(map);
  const slider=document.getElementById('radarSlider'),time=document.getElementById('radarTime');if(slider)slider.value=String(i);if(time)time.textContent=typeof fmtUnixHour==='function'?fmtUnixHour(f.time):new Date(f.time*1000).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function removeV50StormLayer(){try{if(v50StormLayer&&map?.hasLayer?.(v50StormLayer))map.removeLayer(v50StormLayer);}catch{}v50StormLayer=null;}
async function refreshV50RadarRisk(){
  const box=document.getElementById('v50RadarStorm');if(!box||typeof currentPlace==='undefined'||!currentPlace)return;
  try{let data=null;if(typeof fetchV42HourlyDetails==='function')data=await fetchV42HourlyDetails(false);const h=data?.hourly;if(!h?.time?.length)throw new Error();const now=Date.now();let s=h.time.findIndex(t=>new Date(t).getTime()>=now-3600000);if(s<0)s=0;const e=Math.min(s+7,h.time.length),hit=(h.weather_code||[]).slice(s,e).map(Number).findIndex(c=>[95,96,99].includes(c));if(hit>=0){const idx=s+hit;box.textContent=`⛈️ Signal orageux local possible vers ${new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(h.time[idx]))}.`;}else box.textContent='✅ Aucun signal orageux local détecté dans les ~6 prochaines heures.';}catch{box.textContent='Risque orageux local indisponible.';}
}
async function showV50StormOnMap(){
  removeV50StormLayer();await refreshV50RadarRisk();const box=document.getElementById('v50RadarStorm');
  if(!box?.textContent?.includes('Signal orageux')||!window.L||!map||!currentPlace)return;
  v50StormLayer=L.circleMarker([currentPlace.latitude,currentPlace.longitude],{radius:28,weight:4,fillOpacity:.12}).addTo(map).bindPopup('⛈️ Orage prévu à proximité de la ville sélectionnée.');map.setView([currentPlace.latitude,currentPlace.longitude],9);
}

// ===== Statistiques longues =====
function enhanceV50Stats(){
  const panel=document.getElementById('panel-stats');if(!panel)return;
  const toggle=panel.querySelector('.v46-range-toggle');
  if(toggle){[['90','3 mois'],['180','6 mois'],['365','1 an']].forEach(([days,label])=>{if(toggle.querySelector(`[data-days="${days}"]`))return;const b=document.createElement('button');b.type='button';b.dataset.days=days;b.textContent=label;toggle.appendChild(b);});toggle.querySelectorAll('button').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();refreshV50LongStats(Number(b.dataset.days)||30);},true));}
  if(!document.getElementById('v50MonthCompare')){
    const sec=document.createElement('section');sec.id='v50MonthCompare';sec.className='v50-month-compare glass-card';sec.innerHTML='<h3>Ce mois-ci vs mois précédent</h3><div id="v50MonthCompareGrid" class="v50-month-grid"><div class="empty-state">Chargement…</div></div>';
    panel.querySelector('.v46-stats-cards')?.insertAdjacentElement('afterend',sec);
  }
  document.querySelectorAll('[data-tab="stats"],[data-mobile-tab="stats"]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();switchV50Tab('stats');refreshV50LongStats(30);},true));
}
async function fetchV50StatsAll(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)return null;const key=v50PlaceKey();if(!force&&v50StatsAll&&v50StatsKey===key)return v50StatsAll;
  const end=new Date();end.setHours(12,0,0,0);end.setDate(end.getDate()-1);const start=new Date(end);start.setDate(start.getDate()-369);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const u=new URL(V50_STATS_URL);u.searchParams.set('latitude',currentPlace.latitude);u.searchParams.set('longitude',currentPlace.longitude);u.searchParams.set('timezone','auto');u.searchParams.set('start_date',iso(start));u.searchParams.set('end_date',iso(end));u.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,rain_sum,snowfall_sum,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,sunshine_duration');
  const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(`Stats ${r.status}`);v50StatsAll=await r.json();v50StatsKey=key;return v50StatsAll;
}
async function refreshV50LongStats(days=30){
  const panel=document.getElementById('panel-stats');if(!panel)return;days=Math.max(7,Math.min(365,Number(days)||30));
  panel.querySelectorAll('.v46-range-toggle button').forEach(b=>b.classList.toggle('active',Number(b.dataset.days)===days));
  const head=panel.querySelector('.v46-stats-head h2');if(head)head.textContent=days===7?'7 derniers jours':days===30?'30 derniers jours':days===90?'3 derniers mois':days===180?'6 derniers mois':'1 an';
  const cards=document.getElementById('v46StatsCards');if(cards)cards.innerHTML='<div class="empty-state">Chargement de l’historique…</div>';
  try{const data=await fetchV50StatsAll(false);if(typeof v46StatsDays!=='undefined')v46StatsDays=days;if(typeof v46StatsData!=='undefined')v46StatsData=data;if(typeof renderV46Stats==='function')renderV46Stats(data);renderV50MonthComparison(data);}catch(error){console.error('V5 stats',error);if(cards)cards.innerHTML='<div class="empty-state">Impossible de charger cette période.</div>';}
}
function renderV50MonthComparison(data){
  const box=document.getElementById('v50MonthCompareGrid'),d=data?.daily;if(!box||!d?.time?.length)return;
  const endDate=new Date(`${d.time.at(-1)}T12:00:00`),cy=endDate.getFullYear(),cm=endDate.getMonth(),py=cm===0?cy-1:cy,pm=cm===0?11:cm-1;
  const collect=(y,m)=>{const idx=d.time.map((t,i)=>({i,date:new Date(`${t}T12:00:00`)})).filter(x=>x.date.getFullYear()===y&&x.date.getMonth()===m).map(x=>x.i);const vals=k=>idx.map(i=>Number(d[k]?.[i])).filter(Number.isFinite);const sum=k=>vals(k).reduce((a,b)=>a+b,0),avg=k=>{const a=vals(k);return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN},max=k=>{const a=vals(k);return a.length?Math.max(...a):NaN};return{days:idx.length,temp:avg('temperature_2m_mean'),rain:sum('precipitation_sum'),gust:max('wind_gusts_10m_max'),sun:sum('sunshine_duration')/3600};};
  const cur=collect(cy,cm),prev=collect(py,pm),name=(y,m)=>new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(y,m,1));const diff=(a,b,unit,digits=1)=>Number.isFinite(a)&&Number.isFinite(b)?`${a>=b?'+':''}${(a-b).toFixed(digits)} ${unit}`:'--';
  box.innerHTML=`<div class="v50-month-col"><small>${name(cy,cm)}</small><strong>${cur.days} jours disponibles</strong></div><div class="v50-month-metric"><span>🌡️ Temp. moyenne</span><b>${Number.isFinite(cur.temp)?cur.temp.toFixed(1):'--'}°</b><small>${diff(cur.temp,prev.temp,'°')}</small></div><div class="v50-month-metric"><span>🌧️ Pluie</span><b>${cur.rain.toFixed(1)} mm</b><small>${diff(cur.rain,prev.rain,'mm')}</small></div><div class="v50-month-metric"><span>💨 Rafale max</span><b>${Number.isFinite(cur.gust)?Math.round(cur.gust):'--'} km/h</b><small>${diff(cur.gust,prev.gust,'km/h',0)}</small></div><div class="v50-month-metric"><span>☀️ Soleil</span><b>${cur.sun.toFixed(0)} h</b><small>${diff(cur.sun,prev.sun,'h',0)}</small></div><div class="v50-month-col previous"><small>Comparé à</small><strong>${name(py,pm)}</strong></div>`;
}

// ===== Vue compacte =====
function injectV50CompactView(){
  if(document.getElementById('v50CompactModal'))return;
  const modal=document.createElement('div');modal.id='v50CompactModal';modal.className='v50-compact-modal';modal.hidden=true;modal.innerHTML='<div class="v50-compact-backdrop" data-close="1"></div><section class="v50-compact-sheet glass-card"><button id="v50CompactClose" type="button">✕</button><div id="v50CompactContent"></div></section>';document.body.appendChild(modal);
  modal.querySelector('[data-close]')?.addEventListener('click',closeV50Compact);document.getElementById('v50CompactClose')?.addEventListener('click',closeV50Compact);
}
async function openV50Compact(){renderV50Compact();const m=document.getElementById('v50CompactModal');if(m)m.hidden=false;}
function closeV50Compact(){const m=document.getElementById('v50CompactModal');if(m)m.hidden=true;}
async function renderV50Compact(){
  const box=document.getElementById('v50CompactContent');if(!box||!currentData||!currentPlace)return;const c=currentData.current||{},wi=typeof weatherInfo==='function'?weatherInfo(Number(c.weather_code),Number(c.is_day)):['🌤️',''];let rainText='Pluie : --';try{let h=typeof fetchV42HourlyDetails==='function'?await fetchV42HourlyDetails(false):null;const hh=h?.hourly,now=Date.now();let s=hh?.time?.findIndex(t=>new Date(t).getTime()>=now-3600000)??-1;if(s>=0){const vals=(hh.precipitation_probability||[]).slice(s,s+4).map(Number).filter(Number.isFinite);if(vals.length)rainText=`Pluie 4 h : ${Math.max(...vals).toFixed(0)} % max`;}}catch{}
  const alerts=typeof gatherWeatherAlerts==='function'?gatherWeatherAlerts(currentData):[];box.innerHTML=`<span class="section-label">VUE COMPACTE</span><div class="v50-compact-top"><span>${wi[0]}</span><div><h2>${escV50(currentPlace.name)}</h2><p>${wi[1]}</p></div><strong>${Math.round(Number(c.temperature_2m||0))}°</strong></div><div class="v50-compact-grid"><div><span>🌧️</span><b>${rainText}</b></div><div><span>💨</span><b>${Math.round(Number(c.wind_gusts_10m||0))} km/h rafales</b></div><div><span>${alerts[0]?.emoji||'✅'}</span><b>${alerts[0]?alerts[0].title:'Pas d’alerte majeure'}</b></div></div><button type="button" id="v50CompactOpenToday">Ouvrir Aujourd’hui</button>`;document.getElementById('v50CompactOpenToday')?.addEventListener('click',()=>{closeV50Compact();switchV50Tab('today');});
}

// ===== Réglages =====
function injectV50SettingsPanel(){
  if(document.getElementById('panel-settings'))return;
  const panel=document.createElement('section');panel.id='panel-settings';panel.className='tab-panel v50-settings-panel';panel.hidden=true;
  panel.innerHTML=`<div class="v50-page-head"><div><span class="section-label">PERSONNALISATION</span><h2>Réglages</h2><p class="muted">Affichage, radar, alertes et données locales.</p></div></div>
  <div class="v50-settings-grid">
    <article class="glass-card v50-settings-card"><h3>🎨 Apparence</h3><label><span><strong>Thème</strong><small>Automatique, clair ou nuit</small></span><select id="v50Theme"><option value="auto">Automatique</option><option value="day">Toujours clair</option><option value="night">Toujours nuit</option></select></label><label><span><strong>Interface compacte</strong><small>Réduit l’espace entre les blocs</small></span><input id="v50CompactToggle" type="checkbox"></label><label><span><strong>Animations</strong><small>Transitions et effets météo</small></span><input id="v50Animations" type="checkbox"></label><button id="v50HomeOrder" class="secondary-button" type="button">⚙️ Ordre des blocs d’accueil</button></article>
    <article class="glass-card v50-settings-card"><h3>🗺️ Radar</h3><label><span><strong>Colorer la neige</strong><small>RainViewer distingue la neige sur les observations</small></span><input id="v50RadarSnowSetting" type="checkbox"></label><button id="v50RadarOpen" class="secondary-button" type="button">Ouvrir le radar</button></article>
    <article class="glass-card v50-settings-card"><h3>🔔 Alertes intelligentes</h3><label><span><strong>Gel</strong><small>Alerter si la température passe sous le seuil</small></span><input id="v50Frost" type="checkbox"></label><label class="v50-range"><span><strong>Seuil gel</strong><small id="v50FrostLabel">0 °C</small></span><input id="v50FrostThreshold" type="range" min="-10" max="5" value="0" step="1"></label><label><span><strong>Chaleur</strong><small>Alerter au-dessus du seuil</small></span><input id="v50Heat" type="checkbox"></label><label class="v50-range"><span><strong>Seuil chaleur</strong><small id="v50HeatLabel">30 °C</small></span><input id="v50HeatThreshold" type="range" min="25" max="40" value="30" step="1"></label><label><span><strong>Vent anticipé</strong><small>Prévenir avant les fortes rafales</small></span><input id="v50SmartWind" type="checkbox"></label><label><span><strong>Orages anticipés</strong><small>Prévenir lorsqu’un signal orageux approche</small></span><input id="v50SmartStorm" type="checkbox"></label><label class="v50-range"><span><strong>Anticipation</strong><small id="v50LeadLabel">6 h</small></span><input id="v50SmartLead" type="range" min="1" max="12" value="6" step="1"></label><label><span><strong>Heures silencieuses</strong><small>Ne pas envoyer les nouvelles alertes intelligentes pendant cette plage</small></span><input id="v50Quiet" type="checkbox"></label><div class="v50-time-row"><label><span>Début</span><input id="v50QuietStart" type="time" value="22:00"></label><label><span>Fin</span><input id="v50QuietEnd" type="time" value="07:00"></label></div><button id="v50SavePush" type="button">Enregistrer les alertes</button><small id="v50PushState" class="muted"></small></article>
    <article class="glass-card v50-settings-card"><h3>📶 Hors connexion</h3><div id="v50OfflineInfo" class="v50-offline-info">Aucune copie locale.</div><button id="v50ClearOffline" class="secondary-button" type="button">Effacer la copie météo locale</button></article>
  </div>`;
  document.querySelector('footer')?.insertAdjacentElement('beforebegin',panel);
  bindV50SettingsControls();
}
function bindV50SettingsControls(){
  const ids=['v50Theme','v50CompactToggle','v50Animations','v50RadarSnowSetting','v50Frost','v50FrostThreshold','v50Heat','v50HeatThreshold','v50SmartWind','v50SmartStorm','v50SmartLead','v50Quiet','v50QuietStart','v50QuietEnd'];
  ids.forEach(id=>document.getElementById(id)?.addEventListener('change',saveV50SettingsFromUi));
  ['v50FrostThreshold','v50HeatThreshold','v50SmartLead'].forEach(id=>document.getElementById(id)?.addEventListener('input',saveV50SettingsFromUi));
  document.getElementById('v50HomeOrder')?.addEventListener('click',()=>{if(typeof openV45OrderModal==='function')openV45OrderModal();else switchV50Tab('weather');});
  document.getElementById('v50RadarOpen')?.addEventListener('click',()=>switchV50Tab('radar'));
  document.getElementById('v50ClearOffline')?.addEventListener('click',()=>{localStorage.removeItem(V50_OFFLINE_KEY);syncV50OfflineInfo();});
  document.getElementById('v50SavePush')?.addEventListener('click',async()=>{saveV50SettingsFromUi();const s=document.getElementById('v50PushState');try{if(s)s.textContent='Enregistrement…';if(typeof registerAutomaticPush==='function')await registerAutomaticPush(false);if(s)s.textContent='Réglages envoyés au service d’alertes.';}catch(e){if(s)s.textContent=e?.message||'Impossible d’enregistrer les alertes.';}});
}
function syncV50SettingsUi(){
  const s=readV50Settings(),set=(id,v)=>{const e=document.getElementById(id);if(!e)return;if(e.type==='checkbox')e.checked=!!v;else e.value=String(v);};
  set('v50Theme',s.theme);set('v50CompactToggle',s.compact);set('v50Animations',s.animations);set('v50RadarSnowSetting',s.radarSnow);set('v50Frost',s.frost);set('v50FrostThreshold',s.frostThreshold);set('v50Heat',s.heat);set('v50HeatThreshold',s.heatThreshold);set('v50SmartWind',s.smartWind);set('v50SmartStorm',s.smartStorm);set('v50SmartLead',s.smartLeadHours);set('v50Quiet',s.quiet);set('v50QuietStart',s.quietStart);set('v50QuietEnd',s.quietEnd);updateV50SettingLabels();syncV50OfflineInfo();
}
function updateV50SettingLabels(){const s=readV50Settings();const f=document.getElementById('v50FrostLabel'),h=document.getElementById('v50HeatLabel'),l=document.getElementById('v50LeadLabel');if(f)f.textContent=`${s.frostThreshold} °C`;if(h)h.textContent=`${s.heatThreshold} °C`;if(l)l.textContent=`${s.smartLeadHours} h`;}
function saveV50SettingsFromUi(){
  const get=id=>document.getElementById(id),next=saveV50Settings({theme:get('v50Theme')?.value||'auto',compact:get('v50CompactToggle')?.checked??false,animations:get('v50Animations')?.checked??true,radarSnow:get('v50RadarSnowSetting')?.checked??true,frost:get('v50Frost')?.checked??true,frostThreshold:Number(get('v50FrostThreshold')?.value||0),heat:get('v50Heat')?.checked??true,heatThreshold:Number(get('v50HeatThreshold')?.value||30),smartWind:get('v50SmartWind')?.checked??true,smartStorm:get('v50SmartStorm')?.checked??true,smartLeadHours:Number(get('v50SmartLead')?.value||6),quiet:get('v50Quiet')?.checked??false,quietStart:get('v50QuietStart')?.value||'22:00',quietEnd:get('v50QuietEnd')?.value||'07:00'});applyV50Settings();updateV50SettingLabels();syncV50RadarButtons();return next;
}
function applyV50Settings(){
  const s=readV50Settings();document.body.classList.toggle('v50-compact-ui',!!s.compact);document.body.classList.toggle('v50-no-motion',!s.animations);
  if(s.theme==='auto'){try{applyV44Theme?.();}catch{}}
  if(s.theme==='day'){document.body.classList.remove('night','v44-night');document.body.classList.add('v44-day');}
  if(s.theme==='night'){document.body.classList.add('night','v44-night');document.body.classList.remove('v44-day');}
  syncV50SettingsUi();
}

// ===== Push settings extension =====
function patchV50PushSettings(){
  if(window.__v50PushPatched)return;window.__v50PushPatched=true;
  try{
    v50OriginalSyncPush=typeof syncAdvancedControlsToStorage==='function'?syncAdvancedControlsToStorage:null;
    if(v50OriginalSyncPush){syncAdvancedControlsToStorage=function(){const base=v50OriginalSyncPush();const s=readV50Settings();return{...base,frost:s.frost,frostThreshold:s.frostThreshold,heat:s.heat,heatThreshold:s.heatThreshold,smartWind:s.smartWind,smartStorm:s.smartStorm,smartLeadHours:s.smartLeadHours,quiet:s.quiet,quietStart:s.quietStart,quietEnd:s.quietEnd};};}
  }catch(error){console.warn('V5 push patch',error);}
}

// ===== Offline =====
function injectV50OfflineBanner(){
  if(document.getElementById('v50OfflineBanner'))return;const b=document.createElement('div');b.id='v50OfflineBanner';b.className='v50-offline-banner';b.hidden=true;document.body.appendChild(b);
}
function saveV50OfflineSnapshot(){
  try{if(!currentPlace||!currentData)return;localStorage.setItem(V50_OFFLINE_KEY,JSON.stringify({savedAt:Date.now(),place:currentPlace,data:currentData}));syncV50OfflineInfo();}catch{}
}
function restoreV50OfflineSnapshot(){
  try{const snap=JSON.parse(localStorage.getItem(V50_OFFLINE_KEY)||'null');if(!snap?.place||!snap?.data)return false;currentPlace=snap.place;currentData=snap.data;document.getElementById('placeName').textContent=currentPlace.name||'Dernière position';document.getElementById('placeDetail').textContent='Dernières données enregistrées';renderCurrent?.(currentData);renderHourly?.(currentData);renderDaily?.(currentData);updateFavoriteButton?.();renderWeatherAlerts?.();showV50OfflineBanner(snap.savedAt);renderV50Today();return true;}catch{return false;}
}
function showV50OfflineBanner(savedAt){const b=document.getElementById('v50OfflineBanner');if(!b)return;if(navigator.onLine){b.hidden=true;return;}b.hidden=false;b.textContent=`📶 Hors connexion • dernière météo enregistrée ${savedAt?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(savedAt)):'précédemment'}`;}
function bindV50OnlineState(){window.addEventListener('offline',()=>{let t=null;try{t=JSON.parse(localStorage.getItem(V50_OFFLINE_KEY)||'null')?.savedAt;}catch{}showV50OfflineBanner(t);});window.addEventListener('online',()=>{showV50OfflineBanner();if(typeof currentPlace!=='undefined'&&currentPlace&&typeof loadWeather==='function')loadWeather(currentPlace.latitude,currentPlace.longitude,currentPlace);});}
function syncV50OfflineInfo(){const box=document.getElementById('v50OfflineInfo');if(!box)return;try{const s=JSON.parse(localStorage.getItem(V50_OFFLINE_KEY)||'null');box.textContent=s?.savedAt?`Dernière copie : ${new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s.savedAt))} • ${s.place?.name||''}`:'Aucune copie météo enregistrée.';}catch{box.textContent='Aucune copie météo enregistrée.';}}

// ===== Place updates / design polish =====
function bindV50PlaceObserver(){
  const p=document.getElementById('placeName');if(!p||!('MutationObserver'in window))return;new MutationObserver(()=>{clearTimeout(v50PlaceTimer);v50PlaceTimer=setTimeout(()=>{saveV50OfflineSnapshot();renderV50Today();renderV50CompareChoices();refreshV50RadarRisk();applyV50Settings();v50StatsAll=null;v50StatsKey='';},700);}).observe(p,{childList:true,subtree:true,characterData:true});
}
