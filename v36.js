const V36_VERSION='3.6';
let v36Frames=[];
let v36Timer=null;
let v36Mode=false;
let v36NowIndex=0;
let v36Host='';
let v36LoadId=0;
let v36CancelFrame=null;
let v36RetireFrame=null;

(function initV36(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v36.css?v=${V36_VERSION}`;document.head.appendChild(css);
  const boot=()=>{
    const panel=document.getElementById('panel-radar');
    const switcher=document.querySelector('.radar-source-switch');
    if(!panel||!switcher||typeof showMeteoFranceForecast!=='function')return setTimeout(boot,300);
    injectUnifiedRadarUi();
    bindUnifiedRadarOpen();
    if(!panel.hidden)setTimeout(()=>showUnifiedRadar(),350);
  };
  boot();
})();

function injectUnifiedRadarUi(){
  if(document.getElementById('radarUnifiedMode'))return;
  const switcher=document.querySelector('.radar-source-switch');
  if(!switcher)return;

  const unified=document.createElement('button');
  unified.id='radarUnifiedMode';
  unified.type='button';
  unified.className='active';
  unified.textContent='🌦️ Passé → Futur';
  switcher.prepend(unified);

  const card=document.querySelector('#panel-radar .radar-card');
  if(!card)return;
  const controls=document.createElement('div');
  controls.id='v36TimelineControls';
  controls.className='v36-timeline-controls';
  controls.innerHTML=`
    <div class="v36-timeline-head">
      <div>
        <strong id="v36TimelineTitle">Radar complet</strong>
        <small id="v36TimelineSource">Chargement…</small>
      </div>
      <span id="v36TimelineLead" class="v36-phase-badge">--</span>
    </div>
    <div class="v36-slider-wrap">
      <input id="v36TimelineSlider" type="range" min="0" max="0" value="0" step="1" aria-label="Timeline radar passé et futur">
      <div id="v36NowMarker" class="v36-now-marker" aria-hidden="true"><span>MAINTENANT</span></div>
    </div>
    <div class="v36-scale"><span id="v36PastLabel">−2 h</span><span>Observation</span><span>Prévision</span><span id="v36FutureLabel">+3 h</span></div>
    <div class="v36-actions">
      <button id="v36Play" type="button">▶ Animer passé → futur</button>
      <button id="v36Refresh" type="button">↻ Actualiser tout</button>
    </div>
    <p class="v36-note">À gauche de « Maintenant » : radar observé. À droite : prévisions Météo‑France AROME‑PI.</p>`;

  const mf=document.getElementById('mfForecastControls');
  (mf||card.querySelector('.radar-controls')||card).insertAdjacentElement('afterend',controls);

  unified.addEventListener('click',()=>showUnifiedRadar(true));
  document.getElementById('v36TimelineSlider').addEventListener('input',e=>{
    stopUnifiedAnimation();
    showUnifiedFrame(Number(e.target.value||0));
  });
  document.getElementById('v36Play').addEventListener('click',toggleUnifiedAnimation);
  document.getElementById('v36Refresh').addEventListener('click',async()=>{
    stopUnifiedAnimation();
    try{if(typeof radarLoadedFor!=='undefined')radarLoadedFor=null;}catch{}
    try{if(typeof mfForecastMeta!=='undefined')mfForecastMeta=null;}catch{}
    await showUnifiedRadar(true);
  });

  document.getElementById('radarObservedMode')?.addEventListener('click',()=>leaveUnifiedMode(),true);
  document.getElementById('radarForecastMode')?.addEventListener('click',()=>leaveUnifiedMode(),true);
  document.getElementById('radarOpacityV34')?.addEventListener('input',applyUnifiedOpacity);
  document.getElementById('radarSpeedV34')?.addEventListener('change',()=>{if(v36Timer)stopUnifiedAnimation();});
}

function bindUnifiedRadarOpen(){
  document.querySelectorAll('[data-tab="radar"],[data-mobile-tab="radar"]').forEach(button=>{
    button.addEventListener('click',()=>setTimeout(()=>showUnifiedRadar(),420));
  });
  const panel=document.getElementById('panel-radar');
  if(panel&&'MutationObserver'in window){
    new MutationObserver(()=>{if(!panel.hidden)setTimeout(()=>showUnifiedRadar(),350);}).observe(panel,{attributes:true,attributeFilter:['hidden']});
  }
}

function leaveUnifiedMode(){
  v36Mode=false;
  v36LoadId++;
  stopUnifiedAnimation();
  const controls=document.getElementById('v36TimelineControls');if(controls)controls.hidden=true;
  document.getElementById('radarUnifiedMode')?.classList.remove('active');
}

function setUnifiedUi(){
  v36Mode=true;
  stopMfAnimation?.();
  stopObservedAnimation?.();
  document.getElementById('radarUnifiedMode')?.classList.add('active');
  document.getElementById('radarObservedMode')?.classList.remove('active');
  document.getElementById('radarForecastMode')?.classList.remove('active');
  const controls=document.getElementById('v36TimelineControls');if(controls)controls.hidden=false;
  const old=document.querySelector('#panel-radar .radar-controls');if(old)old.hidden=true;
  const oldPlay=document.getElementById('radarPlayBtn');if(oldPlay)oldPlay.hidden=true;
  const mf=document.getElementById('mfForecastControls');if(mf)mf.hidden=true;
}

async function ensureObservedFrames(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)throw new Error('Ville non chargée.');
  if(typeof initMap==='function'&&!initMap())throw new Error('La carte ne peut pas se charger.');
  if(force||!Array.isArray(radarFrames)||!radarFrames.length){
    const result=await fetchRadarFrames();
    radarFrames=result.frames;
    v36Host=result.host;
    const slider=document.getElementById('radarSlider');if(slider)slider.dataset.host=result.host;
  }else{
    v36Host=document.getElementById('radarSlider')?.dataset.host||'https://tilecache.rainviewer.com';
  }
  return radarFrames;
}

function makeUnifiedFrames(observed,meta){
  const now=Date.now();
  const past=(observed||[]).map((f,index)=>({
    type:'observed',
    timestamp:Number(f.time)*1000,
    observedIndex:index,
    raw:f
  })).filter(x=>Number.isFinite(x.timestamp)&&x.timestamp<=now+2*60000);

  const future=(meta?.frames||[]).map((f,index)=>({
    type:'forecast',
    timestamp:Date.parse(f.time),
    forecastIndex:index,
    raw:f
  })).filter(x=>Number.isFinite(x.timestamp)&&x.timestamp>now+2*60000);

  past.sort((a,b)=>a.timestamp-b.timestamp);
  future.sort((a,b)=>a.timestamp-b.timestamp);
  const current={type:'now',timestamp:now};
  v36Frames=[...past,...(past.length?[current]:[]),...future];
  v36NowIndex=past.length?past.length:-1;
  return v36Frames;
}

async function showUnifiedRadar(force=false){
  if(window.meteoRadarShowsRain?.()===false)return;
  if(typeof currentPlace==='undefined'||!currentPlace)return;
  stopUnifiedAnimation();
  const loadId=++v36LoadId;
  setUnifiedUi();
  const status=document.getElementById('radarStatus');
  if(status)status.textContent='Chargement de la timeline radar complète…';
  try{
    const [observed,forecast]=await Promise.allSettled([
      ensureObservedFrames(force),
      fetchMfMeta(force)
    ]);
    if(loadId!==v36LoadId||!v36Mode||window.meteoRadarShowsRain?.()===false)return;
    makeUnifiedFrames(observed.value,forecast.value);
    if(!v36Frames.length)throw new Error('Aucune image radar disponible.');

    const slider=document.getElementById('v36TimelineSlider');
    slider.max=String(v36Frames.length-1);
    slider.value=String(Math.max(0,v36NowIndex));
    updateNowMarker();
    updateScaleLabels();

    if(typeof map!=='undefined'&&map&&currentPlace){
      map.setView([currentPlace.latitude,currentPlace.longitude],Math.max(map.getZoom?.()||7,7));
      marker?.setLatLng?.([currentPlace.latitude,currentPlace.longitude]);
      setTimeout(()=>map.invalidateSize?.(),50);
    }
    return await showUnifiedFrame(Math.max(0,v36NowIndex));
  }catch(error){
    console.error(error);
    if(loadId===v36LoadId&&status)status.textContent='Radar pluie indisponible. Réessaie avec « Actualiser tout ».';
  }
}

function updateNowMarker(){
  const markerEl=document.getElementById('v36NowMarker');
  if(!markerEl)return;
  markerEl.hidden=v36NowIndex<0||v36Frames.length<2;
  if(markerEl.hidden)return;
  const pct=(v36NowIndex/(v36Frames.length-1))*100;
  markerEl.style.left=`${pct}%`;
}

function updateScaleLabels(){
  const first=v36Frames[0],last=v36Frames[v36Frames.length-1],now=Date.now();
  const pastMin=first?Math.max(0,Math.round((now-first.timestamp)/60000)):0;
  const futureMin=last?Math.max(0,Math.round((last.timestamp-now)/60000)):0;
  const fmt=m=>m>=60?`${Math.floor(m/60)} h${m%60?` ${m%60} min`:''}`:`${m} min`;
  const p=document.getElementById('v36PastLabel'),f=document.getElementById('v36FutureLabel');
  if(p)p.textContent=`−${fmt(pastMin)}`;
  if(f)f.textContent=`+${fmt(futureMin)}`;
}

function removeForecastLayer(){
  try{if(mfForecastLayer&&typeof map!=='undefined'&&map?.hasLayer?.(mfForecastLayer))map.removeLayer(mfForecastLayer);}catch{}
  mfForecastLayer=null;
}

function removeObservedLayer(){
  try{if(typeof radarLayer!=='undefined'&&radarLayer&&typeof map!=='undefined'&&map?.hasLayer?.(radarLayer))map.removeLayer(radarLayer);}catch{}
}

function applyUnifiedOpacity(){
  const opacity=Number(document.getElementById('radarOpacityV34')?.value||68)/100;
  try{radarLayer?.setOpacity?.(opacity);}catch{}
  try{mfForecastLayer?.setOpacity?.(opacity);}catch{}
}

function loadUnifiedLayer(layer){
  v36CancelFrame?.();
  return new Promise(resolve=>{
    let hasTileError=false;
    const onTileError=()=>{hasTileError=true;};
    const onLoad=()=>finish(!hasTileError);
    const onError=()=>finish(false);
    const timeout=setTimeout(onError,4500);
    function finish(ready){
      clearTimeout(timeout);
      layer.off({load:onLoad,error:onError,tileerror:onTileError});
      v36CancelFrame=null;
      if(!ready)layer.remove();
      resolve(ready);
    }
    v36CancelFrame=()=>finish(null);
    layer.on({load:onLoad,error:onError,tileerror:onTileError});
    layer.addTo(map);
  });
}

function swapUnifiedLayer(layer,forecast){
  v36RetireFrame?.();
  const previous=[radarLayer,mfForecastLayer].filter(item=>item&&map.hasLayer(item));
  radarLayer=forecast?null:layer;
  mfForecastLayer=forecast?layer:null;
  previous.forEach(item=>item.setZIndex?.(400));
  const opacity=Number(document.getElementById('radarOpacityV34')?.value||68)/100;
  layer.setOpacity(opacity);
  const element=layer.getElement?.()||layer.getContainer?.();
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animation=previous.length&&!reduce&&!document.body.classList.contains('v50-no-motion')
    ?element?.animate?.([{opacity:0},{opacity}],{duration:160,easing:'ease-out'}):null;
  function retire(){
    previous.forEach(item=>item.remove());
    animation?.cancel();
    v36RetireFrame=null;
  }
  if(animation){
    const timer=setTimeout(retire,160);
    v36RetireFrame=()=>{clearTimeout(timer);retire();};
  }else{
    previous.forEach(item=>item.remove());
  }
}

async function showUnifiedFrame(index){
  if(window.meteoRadarShowsRain?.()===false||!v36Mode||!v36Frames.length||typeof map==='undefined'||!map)return;
  index=Math.max(0,Math.min(v36Frames.length-1,Number(index)||0));
  const frame=v36Frames[index];if(!frame)return;
  const forecast=frame.type==='forecast';
  const raw=frame.type==='now'?v36Frames[index-1]?.raw:frame.raw;
  if(!raw)return false;
  const snow=typeof readV50Settings==='function'&&readV50Settings().radarSnow===false?0:1;
  const layer=forecast
    ?L.imageOverlay(mfImageUrl(raw),mfForecastMeta.bounds,{opacity:0,zIndex:450,interactive:false})
    :L.tileLayer(`${v36Host}${raw.path}/256/{z}/{x}/{y}/2/1_${snow}.png`,{tileSize:256,opacity:0,pane:'overlayPane',zIndex:450,maxNativeZoom:7,maxZoom:10});
  const ready=await loadUnifiedLayer(layer);
  if(!ready||!v36Mode||window.meteoRadarShowsRain?.()===false){
    layer.remove();
    if(ready===false){
      const status=document.getElementById('radarStatus');
      if(status)status.textContent='Image pluie indisponible. La dernière image chargée reste affichée.';
    }
    return false;
  }
  swapUnifiedLayer(layer,forecast);
  const slider=document.getElementById('v36TimelineSlider');if(slider)slider.value=String(index);
  if(!forecast){
    const observedSlider=document.getElementById('radarSlider'),time=document.getElementById('radarTime');
    if(observedSlider)observedSlider.value=String(frame.type==='now'?v36Frames[index-1].observedIndex:frame.observedIndex);
    if(time)time.textContent=fmtUnixHour(raw.time);
  }

  const title=document.getElementById('v36TimelineTitle');
  const source=document.getElementById('v36TimelineSource');
  const badge=document.getElementById('v36TimelineLead');
  const status=document.getElementById('radarStatus');
  const now=Date.now();

  if(forecast){
    const mins=Math.max(0,Math.round((frame.timestamp-now)/60000));
    if(title)title.textContent=`Prévision ${localHour(frame.raw.time)}`;
    if(source)source.textContent='Météo-France • AROME Prévision Immédiate';
    if(badge){badge.textContent=`+${mins} min`;badge.dataset.phase='future';}
    if(status)status.textContent=`Prévision Météo-France • +${mins} min • modèle ${localHour(mfForecastMeta.referenceTime)}`;
  }else{
    if(frame.type==='now'){
      const latest=v36Frames[Math.max(0,v36NowIndex-1)];
      if(title)title.textContent='Maintenant';
      if(source)source.textContent=latest?.timestamp?`Dernière observation radar : ${localHour(new Date(latest.timestamp).toISOString())}`:'Dernière observation radar';
      if(badge){badge.textContent='MAINTENANT';badge.dataset.phase='now';}
      if(status)status.textContent=v36NowIndex<v36Frames.length-1?'Maintenant • dernière observation RainViewer':'Observations RainViewer • prévisions indisponibles';
    }else{
      const mins=Math.max(0,Math.round((now-frame.timestamp)/60000));
      if(title)title.textContent=`Observation ${localHour(new Date(frame.timestamp).toISOString())}`;
      if(source)source.textContent='RainViewer • radar observé';
      if(badge){badge.textContent=`−${mins} min`;badge.dataset.phase='past';}
      if(status)status.textContent=`Observation radar • il y a ${mins} min`;
    }
  }
  return true;
}

function unifiedSpeed(){
  return Number(document.getElementById('radarSpeedV34')?.value||700);
}

function stopUnifiedAnimation(){
  if(v36Timer){clearTimeout(v36Timer);v36Timer=null;}
  v36CancelFrame?.();
  v36RetireFrame?.();
  const button=document.getElementById('v36Play');if(button)button.textContent='▶ Animer passé → futur';
}

function toggleUnifiedAnimation(){
  if(v36Frames.length<2)return;
  if(v36Timer){stopUnifiedAnimation();return;}
  const button=document.getElementById('v36Play');if(button)button.textContent='⏸ Pause';
  let index=Number(document.getElementById('v36TimelineSlider')?.value||0);
  const tick=async()=>{
    if(!v36Mode||window.meteoRadarShowsRain?.()===false)return stopUnifiedAnimation();
    const timer=v36Timer;
    index=(index+1)%v36Frames.length;
    await showUnifiedFrame(index);
    if(v36Timer!==timer)return;
    const delay=index===v36NowIndex?Math.max(1400,unifiedSpeed()*1.8):unifiedSpeed();
    v36Timer=setTimeout(tick,delay);
  };
  v36Timer=setTimeout(tick,unifiedSpeed());
}
