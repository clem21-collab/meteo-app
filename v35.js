const V35_BACKEND = typeof PUSH_BACKEND !== 'undefined' ? PUSH_BACKEND : 'https://meteo-push.clemret17.workers.dev';
let mfForecastMeta = null;
let mfForecastLayer = null;
let mfForecastTimer = null;
let mfForecastMode = false;

(function initV35(){
  const css=document.createElement('link');css.rel='stylesheet';css.href='v35.css?v=3.5';document.head.appendChild(css);
  const boot=()=>{
    const panel=document.getElementById('panel-radar');
    if(!panel)return setTimeout(boot,300);
    injectMeteoFranceRadarUi();
  };
  boot();
})();

function injectMeteoFranceRadarUi(){
  if(document.querySelector('.radar-source-switch'))return;
  const header=document.querySelector('#panel-radar .radar-header');
  const card=document.querySelector('#panel-radar .radar-card');
  if(!header||!card)return;

  const switcher=document.createElement('div');
  switcher.className='radar-source-switch';
  switcher.innerHTML=`
    <button id="radarObservedMode" type="button" class="active">📡 Observations</button>
    <button id="radarForecastMode" type="button">⏩ Prévisions Météo-France</button>`;
  const toolbar=document.querySelector('#panel-radar .radar-v34-toolbar');
  (toolbar||header).insertAdjacentElement('afterend',switcher);

  const controls=document.createElement('div');
  controls.id='mfForecastControls';
  controls.className='mf-forecast-controls';
  controls.hidden=true;
  controls.innerHTML=`
    <div class="mf-forecast-top">
      <strong id="mfForecastTime">Prévision --:--</strong>
      <span id="mfForecastLead">+-- min</span>
    </div>
    <input id="mfForecastSlider" type="range" min="0" max="0" value="0" step="1" aria-label="Échéance de prévision Météo-France">
    <div class="mf-forecast-actions">
      <button id="mfForecastPlay" type="button">▶ Animer le futur</button>
      <button id="mfForecastRefresh" type="button">↻ Actualiser Météo-France</button>
    </div>
    <div class="mf-badge">🇫🇷 AROME Prévision Immédiate • pas de 15 min</div>
    <div class="mf-radar-note">Après « Maintenant », les images sont des prévisions du modèle AROME‑PI de Météo‑France, pas des observations radar mesurées.</div>`;
  const oldControls=card.querySelector('.radar-controls');
  (oldControls||card).insertAdjacentElement('afterend',controls);

  const attr=document.querySelector('#panel-radar .attribution');
  if(attr)attr.textContent='Carte © OpenStreetMap • Observations : RainViewer • Prévisions : Météo-France AROME‑PI';

  document.getElementById('radarObservedMode').addEventListener('click',showObservedRadar);
  document.getElementById('radarForecastMode').addEventListener('click',showMeteoFranceForecast);
  document.getElementById('mfForecastSlider').addEventListener('input',e=>showMfFrame(Number(e.target.value||0)));
  document.getElementById('mfForecastPlay').addEventListener('click',toggleMfAnimation);
  document.getElementById('mfForecastRefresh').addEventListener('click',async()=>{
    stopMfAnimation();mfForecastMeta=null;
    await showMeteoFranceForecast(true);
  });

  const opacity=document.getElementById('radarOpacityV34');
  opacity?.addEventListener('input',()=>{
    if(mfForecastLayer)mfForecastLayer.setOpacity(Number(opacity.value||70)/100);
  });
}

function setRadarModeButtons(forecast){
  document.getElementById('radarObservedMode')?.classList.toggle('active',!forecast);
  document.getElementById('radarForecastMode')?.classList.toggle('active',forecast);
}

function setForecastUiVisible(forecast){
  const oldControls=document.querySelector('#panel-radar .radar-controls');
  const oldPlay=document.getElementById('radarPlayBtn');
  const mf=document.getElementById('mfForecastControls');
  if(oldControls)oldControls.hidden=forecast;
  if(oldPlay)oldPlay.hidden=forecast;
  if(mf)mf.hidden=!forecast;
}

function stopObservedAnimation(){
  const play=document.getElementById('radarPlayBtn');
  if(play&&/Pause/i.test(play.textContent||''))play.click();
}

function stopMfAnimation(){
  if(mfForecastTimer){clearInterval(mfForecastTimer);mfForecastTimer=null;}
  const b=document.getElementById('mfForecastPlay');if(b)b.textContent='▶ Animer le futur';
}

async function fetchMfMeta(force=false){
  if(mfForecastMeta&&!force)return mfForecastMeta;
  const response=await fetch(`${V35_BACKEND}/mf-nowcast/meta${force?'?refresh=1':''}`,{cache:'no-store'});
  let data={};
  try{data=await response.json();}catch{}
  if(!response.ok||!data.ok)throw new Error(data.error||`Météo-France indisponible (${response.status})`);
  if(!Array.isArray(data.frames)||!data.frames.length)throw new Error('Aucune échéance AROME-PI disponible pour le moment.');
  mfForecastMeta=data;
  return data;
}

async function showMeteoFranceForecast(force=false){
  mfForecastMode=true;
  stopObservedAnimation();stopMfAnimation();
  setRadarModeButtons(true);setForecastUiVisible(true);
  const status=document.getElementById('radarStatus');
  if(status)status.textContent='Chargement des prévisions Météo-France…';
  try{
    const meta=await fetchMfMeta(force);
    const slider=document.getElementById('mfForecastSlider');
    slider.max=String(Math.max(0,meta.frames.length-1));
    let first=meta.frames.findIndex(f=>Number(f.minutes)>=0);
    if(first<0)first=0;
    slider.value=String(first);
    await showMfFrame(first);
    if(typeof map!=='undefined'&&map&&typeof currentPlace!=='undefined'&&currentPlace){
      map.setView([currentPlace.latitude,currentPlace.longitude],Math.max(map.getZoom?.()||7,7));
      setTimeout(()=>map.invalidateSize?.(),50);
    }
  }catch(error){
    console.error(error);
    mfForecastMode=false;setRadarModeButtons(false);setForecastUiVisible(false);
    if(status)status.textContent=`Prévisions Météo-France indisponibles : ${error.message}`;
  }
}

function mfImageUrl(frame){
  const meta=mfForecastMeta;
  return `${V35_BACKEND}/mf-nowcast/image?time=${encodeURIComponent(frame.time)}&reference_time=${encodeURIComponent(meta.referenceTime)}`;
}

function localHour(iso){
  const d=new Date(iso);
  return new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(d);
}

async function showMfFrame(index){
  if(!mfForecastMode||!mfForecastMeta||typeof L==='undefined'||typeof map==='undefined'||!map)return;
  const frames=mfForecastMeta.frames||[];
  index=Math.max(0,Math.min(frames.length-1,index));
  const frame=frames[index];if(!frame)return;

  try{
    if(typeof radarLayer!=='undefined'&&radarLayer&&map.hasLayer?.(radarLayer))map.removeLayer(radarLayer);
  }catch{}
  try{if(mfForecastLayer&&map.hasLayer?.(mfForecastLayer))map.removeLayer(mfForecastLayer);}catch{}

  const opacity=Number(document.getElementById('radarOpacityV34')?.value||72)/100;
  mfForecastLayer=L.imageOverlay(mfImageUrl(frame),mfForecastMeta.bounds,{opacity,zIndex:450,interactive:false});
  mfForecastLayer.addTo(map);

  const slider=document.getElementById('mfForecastSlider');if(slider)slider.value=String(index);
  const lead=Math.max(0,Number(frame.minutes||0));
  const time=document.getElementById('mfForecastTime');if(time)time.textContent=`Prévision ${localHour(frame.time)}`;
  const label=document.getElementById('mfForecastLead');if(label)label.textContent=lead<=5?'Maintenant':`+${lead} min`;
  const status=document.getElementById('radarStatus');
  if(status)status.textContent=`Météo-France AROME‑PI • ${lead<=5?'maintenant':`+${lead} min`} • mise à jour modèle ${localHour(mfForecastMeta.referenceTime)}`;
}

function toggleMfAnimation(){
  if(!mfForecastMeta?.frames?.length)return;
  if(mfForecastTimer){stopMfAnimation();return;}
  const button=document.getElementById('mfForecastPlay');if(button)button.textContent='⏸ Pause';
  let index=Number(document.getElementById('mfForecastSlider')?.value||0);
  mfForecastTimer=setInterval(()=>{
    index=(index+1)%mfForecastMeta.frames.length;
    showMfFrame(index);
  },850);
}

async function showObservedRadar(){
  mfForecastMode=false;stopMfAnimation();
  setRadarModeButtons(false);setForecastUiVisible(false);
  try{if(mfForecastLayer&&typeof map!=='undefined'&&map?.hasLayer?.(mfForecastLayer))map.removeLayer(mfForecastLayer);}catch{}
  mfForecastLayer=null;
  const status=document.getElementById('radarStatus');if(status)status.textContent='Chargement des observations radar…';
  try{
    if(typeof radarLoadedFor!=='undefined')radarLoadedFor=null;
    if(typeof loadRadarForCurrentPlace==='function')await loadRadarForCurrentPlace();
  }catch(error){console.error(error);if(status)status.textContent='Impossible de recharger les observations radar.';}
}
