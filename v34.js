const V34_AIR_URL='https://air-quality-api.open-meteo.com/v1/air-quality';
const V34_SETTINGS_KEY='meteo-app-alert-settings-v34';
let v34LastPlaceKey='';
let v34RadarTimer=null;

(function initV34(){
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='v34.css?v=3.4';document.head.appendChild(link);

  injectAirTab();
  injectSoonRainCard();
  injectAlertControls();
  improveRadar();
  extendAlertSettings();
  watchPlaceChanges();

  setTimeout(refreshV34ForCurrentPlace,1200);
})();

function injectAirTab(){
  const tabs=document.querySelector('.tabs');
  if(tabs&&!document.querySelector('[data-tab="air"]')){
    const b=document.createElement('button');
    b.className='tab';b.type='button';b.dataset.tab='air';b.textContent='Air & pollen';
    const fav=tabs.querySelector('[data-tab="favorites"]');
    tabs.insertBefore(b,fav||null);
    b.addEventListener('click',()=>{if(typeof switchTab==='function')switchTab('air');loadAirForCurrentPlace();});
  }

  const mobile=document.querySelector('.mobile-bottom-nav');
  if(mobile&&!mobile.querySelector('[data-mobile-tab="air"]')){
    mobile.classList.add('v34-five');
    const b=document.createElement('button');
    b.type='button';b.dataset.mobileTab='air';b.innerHTML='<span>🌿</span><small>Air</small>';
    const fav=mobile.querySelector('[data-mobile-tab="favorites"]');
    mobile.insertBefore(b,fav||null);
    b.addEventListener('click',()=>{if(typeof switchTab==='function')switchTab('air');loadAirForCurrentPlace();});
  }

  if(!document.getElementById('panel-air')){
    const panel=document.createElement('section');
    panel.id='panel-air';panel.className='tab-panel';panel.hidden=true;
    panel.innerHTML=`
      <div class="section-heading"><div><h2>Qualité de l’air & pollen</h2><p class="muted" id="airUpdated">Chargement…</p></div></div>
      <div class="air-summary-grid">
        <article class="glass-card air-card"><span class="air-label">Indice européen</span><strong id="airAqi">--</strong><small id="airAqiLabel">--</small></article>
        <article class="glass-card air-card"><span class="air-label">PM2.5</span><strong id="airPm25">--</strong><small>µg/m³</small></article>
        <article class="glass-card air-card"><span class="air-label">PM10</span><strong id="airPm10">--</strong><small>µg/m³</small></article>
        <article class="glass-card air-card"><span class="air-label">Ozone O₃</span><strong id="airOzone">--</strong><small>µg/m³</small></article>
        <article class="glass-card air-card"><span class="air-label">Dioxyde d’azote NO₂</span><strong id="airNo2">--</strong><small>µg/m³</small></article>
        <article class="glass-card air-card"><span class="air-label">Pollen dominant (24 h)</span><strong id="airDominantPollen">--</strong><small id="airDominantValue">--</small></article>
      </div>
      <article class="glass-card air-card">
        <h3 style="margin-top:0">Pollens</h3>
        <div id="pollensGrid" class="pollens-grid"></div>
        <p class="air-note">Valeurs en grains/m³. Les données pollen sont disponibles en Europe pendant la saison pollinique. Elles sont indicatives et ne remplacent pas un avis médical.</p>
      </article>`;
    const radar=document.getElementById('panel-radar');
    radar?.after(panel);
  }
}

function injectSoonRainCard(){
  if(document.getElementById('soonRainCard'))return;
  const hero=document.querySelector('#panel-weather .hero');
  if(!hero)return;
  const c=document.createElement('div');
  c.id='soonRainCard';c.className='soon-rain-card';
  c.innerHTML='<div class="emoji">🌦️</div><div><strong id="soonRainTitle">Pluie imminente</strong><small id="soonRainText">Analyse des prochaines 60 minutes…</small></div>';
  hero.after(c);
}

function injectAlertControls(){
  const cards=document.querySelectorAll('#panel-alerts .alerts-card');
  const settings=cards[1];if(!settings)return;
  if(!document.getElementById('rainThreshold')){
    const row=document.createElement('label');row.className='setting-block v34-setting';row.htmlFor='rainThreshold';
    row.innerHTML='<span><strong>Seuil de pluie</strong><small id="rainThresholdLabel">70 %</small></span><input id="rainThreshold" type="range" min="20" max="100" value="70" step="5">';
    const rainToggle=document.getElementById('rainAlertToggle')?.closest('.setting-row');rainToggle?.after(row);
  }
  if(!document.getElementById('rainSoonAlertToggle')){
    const row=document.createElement('label');row.className='setting-row v34-setting';
    row.innerHTML='<span><strong>Pluie imminente</strong><small>Alerte si de la pluie est prévue dans environ 15–30 min</small></span><input id="rainSoonAlertToggle" type="checkbox" checked>';
    const rt=document.getElementById('rainThreshold')?.closest('.setting-block');rt?.after(row);
  }
  if(!document.getElementById('alertHours')){
    const row=document.createElement('label');row.className='setting-block v34-setting';row.htmlFor='alertHours';
    row.innerHTML='<span><strong>Anticipation des alertes</strong><small id="alertHoursLabel">6 h</small></span><input id="alertHours" type="range" min="1" max="12" value="6" step="1">';
    settings.appendChild(row);
  }
}

function extendAlertSettings(){
  const original=typeof getAlertSettings==='function'?getAlertSettings:null;
  window.__v34OriginalGetAlertSettings=original;
  getAlertSettings=function(){
    let base={rain:true,wind:true,windThreshold:60,snow:true,storm:true};
    try{if(original)base={...base,...original()};}catch{}
    let ext={rainThreshold:70,rainSoon:true,alertHours:6};
    try{ext={...ext,...JSON.parse(localStorage.getItem(V34_SETTINGS_KEY)||'{}')};}catch{}
    return {...base,...ext};
  };

  const sync=()=>{
    const s=getAlertSettings();
    const r=document.getElementById('rainThreshold'),rs=document.getElementById('rainSoonAlertToggle'),h=document.getElementById('alertHours');
    if(r){r.value=String(s.rainThreshold);document.getElementById('rainThresholdLabel').textContent=`${s.rainThreshold} %`;}
    if(rs)rs.checked=s.rainSoon!==false;
    if(h){h.value=String(s.alertHours);document.getElementById('alertHoursLabel').textContent=`${s.alertHours} h`;}
  };
  sync();

  const save=()=>{
    const ext={
      rainThreshold:Number(document.getElementById('rainThreshold')?.value||70),
      rainSoon:document.getElementById('rainSoonAlertToggle')?.checked!==false,
      alertHours:Number(document.getElementById('alertHours')?.value||6)
    };
    localStorage.setItem(V34_SETTINGS_KEY,JSON.stringify(ext));
    document.getElementById('rainThresholdLabel').textContent=`${ext.rainThreshold} %`;
    document.getElementById('alertHoursLabel').textContent=`${ext.alertHours} h`;
    if('Notification'in window&&Notification.permission==='granted'&&typeof registerAutomaticPush==='function')registerAutomaticPush(false).catch(console.error);
  };
  ['rainThreshold','rainSoonAlertToggle','alertHours'].forEach(id=>{
    const e=document.getElementById(id);if(!e)return;
    e.addEventListener(id==='rainThreshold'||id==='alertHours'?'input':'change',save);
  });
}

function aqiLabel(v){
  const n=Number(v);if(!Number.isFinite(n))return'Donnée indisponible';
  if(n<=20)return'Bon';if(n<=40)return'Correct';if(n<=60)return'Modéré';if(n<=80)return'Mauvais';if(n<=100)return'Très mauvais';return'Extrêmement mauvais';
}
function fmtAir(v,digits=0){const n=Number(v);return Number.isFinite(n)?n.toFixed(digits):'--';}

async function loadAirForCurrentPlace(){
  if(typeof currentPlace==='undefined'||!currentPlace)return;
  const u=new URL(V34_AIR_URL);
  u.searchParams.set('latitude',currentPlace.latitude);u.searchParams.set('longitude',currentPlace.longitude);u.searchParams.set('timezone','auto');u.searchParams.set('forecast_hours','24');
  const vars='european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen';
  u.searchParams.set('current',vars);u.searchParams.set('hourly',vars);
  try{
    const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error('Air quality unavailable');
    const d=await r.json(),c=d.current||{};
    document.getElementById('airAqi').textContent=fmtAir(c.european_aqi);
    document.getElementById('airAqiLabel').textContent=aqiLabel(c.european_aqi);
    document.getElementById('airPm25').textContent=fmtAir(c.pm2_5,1);
    document.getElementById('airPm10').textContent=fmtAir(c.pm10,1);
    document.getElementById('airOzone').textContent=fmtAir(c.ozone,1);
    document.getElementById('airNo2').textContent=fmtAir(c.nitrogen_dioxide,1);
    document.getElementById('airUpdated').textContent=`Pour ${currentPlace.name} • données Open‑Meteo / CAMS`;
    renderPollens(d);
  }catch(e){console.error(e);const u=document.getElementById('airUpdated');if(u)u.textContent='Données de qualité de l’air indisponibles pour le moment.';}
}

function renderPollens(d){
  const fields=[['alder_pollen','Aulne'],['birch_pollen','Bouleau'],['grass_pollen','Graminées'],['mugwort_pollen','Armoise'],['olive_pollen','Olivier'],['ragweed_pollen','Ambroisie']];
  const grid=document.getElementById('pollensGrid');if(!grid)return;grid.innerHTML='';let dominant={name:'Aucun',value:-1};
  for(const [key,name] of fields){
    const cur=Number(d.current?.[key]);const vals=(d.hourly?.[key]||[]).map(Number).filter(Number.isFinite);const peak=vals.length?Math.max(...vals):NaN;
    if(Number.isFinite(peak)&&peak>dominant.value)dominant={name,value:peak};
    const card=document.createElement('div');card.className='pollen-card';
    card.innerHTML=`<strong>${name}</strong><span>${Number.isFinite(cur)?cur.toFixed(1):'--'}</span><small>pic 24 h : ${Number.isFinite(peak)?peak.toFixed(1):'--'} grains/m³</small>`;
    grid.appendChild(card);
  }
  document.getElementById('airDominantPollen').textContent=dominant.value>0?dominant.name:'Faible / hors saison';
  document.getElementById('airDominantValue').textContent=dominant.value>=0?`pic ${dominant.value.toFixed(1)} grains/m³`:'donnée indisponible';
}

async function loadSoonRain(){
  if(typeof currentPlace==='undefined'||!currentPlace)return;
  const text=document.getElementById('soonRainText'),title=document.getElementById('soonRainTitle');if(!text||!title)return;
  const u=new URL(FORECAST_URL);
  u.searchParams.set('latitude',currentPlace.latitude);u.searchParams.set('longitude',currentPlace.longitude);u.searchParams.set('timezone','auto');
  u.searchParams.set('minutely_15','precipitation,rain,weather_code');u.searchParams.set('forecast_minutely_15','8');
  try{
    const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error('15-min forecast unavailable');const d=await r.json(),m=d.minutely_15;
    if(!m?.time?.length)throw new Error('No 15-min data');
    const now=Date.now();let hit=null;
    for(let i=0;i<m.time.length;i++){
      const t=new Date(m.time[i]).getTime(),mins=Math.round((t-now)/60000),p=Number(m.precipitation?.[i]||0);
      if(mins>=0&&mins<=60&&p>=0.1){hit={mins:Math.max(0,Math.round(mins/5)*5),amount:p,time:m.time[i]};break;}
    }
    if(hit){title.textContent='🌧️ Pluie possible bientôt';text.textContent=hit.mins<=5?`Pluie possible très bientôt (${hit.amount.toFixed(1)} mm/15 min).`:`Pluie possible dans ~${hit.mins} min (${hit.amount.toFixed(1)} mm/15 min).`;}
    else{title.textContent='☂️ Pluie imminente';text.textContent='Pas de pluie significative prévue dans les 60 prochaines minutes.';}
  }catch(e){console.error(e);text.textContent='Prévision pluie à 15 min indisponible pour le moment.';}
}

function improveRadar(){
  const header=document.querySelector('#panel-radar .radar-header');if(!header||document.querySelector('.radar-v34-toolbar'))return;
  const toolbar=document.createElement('div');toolbar.className='radar-v34-toolbar';
  toolbar.innerHTML=`<button id="radarRefreshV34" type="button">↻ Actualiser</button><button id="radarCenterV34" type="button">⌖ Recentrer</button><label>Opacité<input id="radarOpacityV34" type="range" min="20" max="100" value="68" step="5"></label><label>Vitesse<select id="radarSpeedV34"><option value="1200">Lente</option><option value="700" selected>Normale</option><option value="400">Rapide</option></select></label>`;
  header.after(toolbar);
  const card=document.querySelector('#panel-radar .radar-card');if(card){const legend=document.createElement('div');legend.className='radar-legend';legend.innerHTML='<span>Faible</span><div class="radar-legend-bar"></div><span>Forte</span>';card.after(legend);}

  const oldPlay=document.getElementById('radarPlayBtn');if(oldPlay){const play=oldPlay.cloneNode(true);oldPlay.replaceWith(play);play.addEventListener('click',()=>{if(v34RadarTimer){clearInterval(v34RadarTimer);v34RadarTimer=null;play.textContent='▶ Animer';return;}if(typeof radarFrames==='undefined'||!radarFrames.length)return;let i=Number(document.getElementById('radarSlider').value||0),host=document.getElementById('radarSlider').dataset.host;play.textContent='⏸ Pause';const tick=()=>{i=(i+1)%radarFrames.length;showRadarFrame(i,host);applyRadarOpacity();};tick();v34RadarTimer=setInterval(tick,Number(document.getElementById('radarSpeedV34').value||700));});}
  document.getElementById('radarRefreshV34').addEventListener('click',()=>{if(v34RadarTimer){clearInterval(v34RadarTimer);v34RadarTimer=null;}try{radarLoadedFor=null;radarFrames.length=0;loadRadarForCurrentPlace();}catch(e){console.error(e);}});
  document.getElementById('radarCenterV34').addEventListener('click',()=>{try{if(map&&currentPlace)map.setView([currentPlace.latitude,currentPlace.longitude],7);}catch(e){console.error(e);}});
  document.getElementById('radarOpacityV34').addEventListener('input',applyRadarOpacity);
  document.getElementById('radarSpeedV34').addEventListener('change',()=>{if(v34RadarTimer){clearInterval(v34RadarTimer);v34RadarTimer=null;const p=document.getElementById('radarPlayBtn');if(p)p.textContent='▶ Animer';}});
  document.getElementById('radarSlider')?.addEventListener('input',()=>{if(v34RadarTimer){clearInterval(v34RadarTimer);v34RadarTimer=null;}setTimeout(applyRadarOpacity,20);});
}
function applyRadarOpacity(){try{if(radarLayer)radarLayer.setOpacity(Number(document.getElementById('radarOpacityV34')?.value||68)/100);}catch{}}

function watchPlaceChanges(){
  const el=document.getElementById('placeName');if(!el)return;
  const obs=new MutationObserver(()=>setTimeout(refreshV34ForCurrentPlace,250));obs.observe(el,{childList:true,characterData:true,subtree:true});
}
function refreshV34ForCurrentPlace(){
  if(typeof currentPlace==='undefined'||!currentPlace)return;const key=`${currentPlace.latitude},${currentPlace.longitude}`;
  loadSoonRain();loadAirForCurrentPlace();
  if(key!==v34LastPlaceKey){v34LastPlaceKey=key;if('Notification'in window&&Notification.permission==='granted'&&typeof registerAutomaticPush==='function')registerAutomaticPush(false).catch(console.error);}
}
