// Météo V5 — Additional weather map layers (rain, snow, wind, temperature)
(function initV50RadarLayers(){
  let overlay=null;
  let mode='rain';
  let refreshTimer=null;
  let request=null;
  let windField=null;
  let windPopup=null;
  window.meteoRadarShowsRain=()=>mode==='rain';
  const CACHE=new Map();
  const METEOFRANCE_URL='https://api.open-meteo.com/v1/meteofrance';
  const GENERIC_URL='https://api.open-meteo.com/v1/forecast';
  const AROME_HD='meteofrance_arome_france_hd';
  const METEOFRANCE_SEAMLESS='meteofrance_seamless';

  const css=document.createElement('style');
  css.textContent=`
    .v50-layer-switcher{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 14px}
    .v50-layer-switcher button{border:1px solid var(--border);background:var(--soft);border-radius:999px;padding:9px 13px;font-weight:800;cursor:pointer}
    .v50-layer-switcher button.active{background:var(--accent,#5d74e8);color:#fff;border-color:transparent}
    .v50-layer-legend{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:8px 0 0;font-size:.82rem;color:var(--muted)}
    .v50-weather-marker{display:flex;align-items:center;justify-content:center;min-width:54px;padding:5px 7px;border-radius:13px;background:rgba(15,23,42,.78);color:#fff;border:1px solid rgba(255,255,255,.25);box-shadow:0 4px 16px rgba(0,0,0,.18);font-weight:800;font-size:.78rem;white-space:nowrap;backdrop-filter:blur(6px)}
    #panel-radar[data-weather-layer]:not([data-weather-layer="rain"]) :is(.radar-controls,#radarPlayBtn,.radar-source-switch,#mfForecastControls,#v36TimelineControls,#v50RadarModes,#v38FullscreenTimeline,#v38FullscreenPlay,.v38-overlay-info,.radar-legend,#radarStatus,#panel-radar > .attribution){display:none}
    .v50-wind-popup{position:absolute;margin-bottom:12px}
    .v50-wind-popup .leaflet-popup-content-wrapper{background:#fff;color:#172039;border-radius:12px;box-shadow:0 3px 14px #0005}
    .v50-wind-popup .leaflet-popup-content{margin:0;padding:12px 42px 12px 14px;box-sizing:border-box;font-size:14px;line-height:1.4}
    .v50-wind-popup .leaflet-popup-tip-container{display:none}
    .v50-wind-popup a.leaflet-popup-close-button{position:absolute;top:0;right:0;display:grid;place-items:center;width:44px;height:44px;color:#172039;text-decoration:none;font-size:24px}
    .v50-weather-marker.snow{background:rgba(59,130,246,.80)}
    .v50-weather-marker.temp-hot{background:rgba(194,65,12,.82)}
    .v50-weather-marker.temp-mild{background:rgba(5,150,105,.82)}
    .v50-weather-marker.temp-cold{background:rgba(37,99,235,.82)}
.v50-wind-scale{display:flex;gap:8px;flex-wrap:wrap}.v50-wind-scale i{display:inline-block;width:18px;height:12px;margin-right:4px;border-radius:3px}

  `;
  document.head.appendChild(css);

  function getMap(){try{return typeof map!=='undefined'?map:null;}catch{return null;}}
  function getPanel(){return document.getElementById('panel-radar');}

  function inject(){
    const panel=getPanel();if(!panel||document.getElementById('v50LayerSwitcher'))return;
    const box=document.createElement('div');
    box.id='v50LayerSwitcher';box.className='v50-layer-switcher';
    box.innerHTML=`<button type="button" data-v50-layer="rain" class="active">🌧️ Pluie</button><button type="button" data-v50-layer="snow">❄️ Neige</button><button type="button" data-v50-layer="wind">💨 Vent</button><button type="button" data-v50-layer="temp">🌡️ Température</button>`;
    const radarCard=panel.querySelector('.radar-card');
    (radarCard||panel.firstElementChild)?.insertAdjacentElement('beforebegin',box);
    const legend=document.createElement('div');legend.setAttribute('role','status');legend.id='v50LayerLegend';legend.className='v50-layer-legend';legend.textContent='Radar de précipitations en direct.';
    box.insertAdjacentElement('afterend',legend);
    box.addEventListener('click',e=>{const b=e.target.closest('[data-v50-layer]');if(!b)return;setMode(b.dataset.v50Layer);});
  }

  function setMode(next){
    mode=next;
    localStorage.setItem('meteo-app-v50-map-layer',mode);
    document.querySelectorAll('#v50LayerSwitcher [data-v50-layer]').forEach(b=>b.classList.toggle('active',b.dataset.v50Layer===mode));
    getPanel().dataset.weatherLayer=mode;
    clearTimeout(refreshTimer);
    const rain=mode==='rain';
    clearOverlay();
    if(rain){
      setLegend('Radar de précipitations en direct.');
      if(typeof showUnifiedRadar==='function')showUnifiedRadar();
      else if(typeof radarLoadedFor!=='undefined'){
        radarLoadedFor=null;
        loadRadarForCurrentPlace();
      }
      return;
    }
    if(typeof stopUnifiedAnimation==='function')stopUnifiedAnimation();
    if(typeof stopMfAnimation==='function')stopMfAnimation();
    if(typeof stopObservedAnimation==='function')stopObservedAnimation();
    if(typeof radarTimer!=='undefined'&&radarTimer)stopRadarAnimation();
    if(typeof removeForecastLayer==='function')removeForecastLayer();
    else if(typeof mfForecastLayer!=='undefined')mfForecastLayer?.remove();
    if(typeof removeV50StormLayer==='function')removeV50StormLayer();
    mRemoveRadar();
    if(!getPanel().hidden)renderOverlay();
  }

  function mRemoveRadar(){const m=getMap();if(m&&typeof radarLayer!=='undefined'&&radarLayer)m.removeLayer(radarLayer);}
  function setLegend(text){const el=document.getElementById('v50LayerLegend');if(el)el.textContent=text;}
  function clearOverlay(keepPopup=false){
    request?.abort();
    request=null;
    windField=null;
    if(!keepPopup){
      windPopup?.remove();
      windPopup=null;
    }
    overlay?.remove();
    overlay=null;
  }

  function samplePoints(){
    const m=getMap();
    const b=m.getBounds();
    const nw=m.project(b.getNorthWest()),se=m.project(b.getSouthEast());
    const size=mode==='wind'?(m.getZoom()>=9?6:5):3;
    const points=[];
    for(let row=0;row<size;row++){
      for(let col=0;col<size;col++){
        const p=m.unproject([nw.x+(se.x-nw.x)*(col+.5)/size,nw.y+(se.y-nw.y)*(row+.5)/size]);
        points.push({lat:Math.max(-85.05113,Math.min(85.05113,p.lat)),lon:m.wrapLatLng(p).lng});
      }
    }
    return {points,size,bounds:b,nw,se,zoom:m.getZoom()};
  }

  function cacheKey(p,layerMode){return `${layerMode}:${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;}
  function usableCurrent(d,layerMode=mode){
    if(!d||typeof d!=='object')return false;
    return layerMode==='wind'?validWind(d)&&validNumber(d.wind_gusts_10m)&&d.wind_gusts_10m>=0:validNumber(d[layerMode==='snow'?'snowfall':'temperature_2m']);
  }

  async function requestBatch(points,url,model,layerMode,signal){
    if(!points.length)return[];
    const u=new URL(url);
    u.searchParams.set('latitude',points.map(p=>p.lat.toFixed(5)).join(','));
    u.searchParams.set('longitude',points.map(p=>p.lon.toFixed(5)).join(','));
    u.searchParams.set('timezone','auto');
    u.searchParams.set('wind_speed_unit','kmh');
    u.searchParams.set('current',layerMode==='wind'?'wind_speed_10m,wind_gusts_10m':layerMode==='snow'?'snowfall':'temperature_2m');
    if(model)u.searchParams.set('models',model);
    const timeout=AbortSignal.timeout(5000);
    const r=await fetch(u,{cache:'no-store',signal:AbortSignal.any([signal,timeout])});if(!r.ok)throw new Error(`Météo HTTP ${r.status}`);
    const json=await r.json(),arr=Array.isArray(json)?json:[json];
    return points.map((p,i)=>arr[i]?.current||{});
  }

  async function fetchPoints(points,signal){
    const requestedMode=mode;
    const out=new Array(points.length),missing=[];
    points.forEach((p,i)=>{const hit=CACHE.get(cacheKey(p,requestedMode));if(hit&&Date.now()-hit.time<10*60*1000)out[i]=hit.data;else missing.push({p,i});});
    if(!missing.length)return out;

    let primary=[];
    try{primary=await requestBatch(missing.map(x=>x.p),METEOFRANCE_URL,AROME_HD,requestedMode,signal);}catch{}
    if(signal.aborted)return out;
    const second=[];
    missing.forEach((entry,j)=>{
      const d=primary[j];
      if(usableCurrent(d,requestedMode)){out[entry.i]={...d,_source:'AROME France HD'};}
      else second.push(entry);
    });

    let seamless=[];
    if(second.length){try{seamless=await requestBatch(second.map(x=>x.p),METEOFRANCE_URL,METEOFRANCE_SEAMLESS,requestedMode,signal);}catch{}
    if(signal.aborted)return out;}
    const third=[];
    second.forEach((entry,j)=>{
      const d=seamless[j];
      if(usableCurrent(d,requestedMode)){out[entry.i]={...d,_source:'Météo-France'};}
      else third.push(entry);
    });

    let generic=[];
    if(third.length){try{generic=await requestBatch(third.map(x=>x.p),GENERIC_URL,null,requestedMode,signal);}catch{}
    if(signal.aborted)return out;}
    third.forEach((entry,j)=>{const d=generic[j]||{};out[entry.i]={...d,_source:'Open-Meteo secours'};});

    if(CACHE.size>500)CACHE.clear();
    missing.forEach(entry=>{const d=out[entry.i]||{};if(!usableCurrent(d,requestedMode))return;CACHE.set(cacheKey(entry.p,requestedMode),{time:Date.now(),data:d});});
    return out;
  }

  const WIND_STOPS=[[0,'#2563eb','0–19'],[20,'#22c55e','20–39'],[40,'#facc15','40–59'],[60,'#f97316','60–79'],[80,'#ef4444','80–99'],[100,'#a855f7','100+']];
  function validNumber(v){return typeof v==='number'&&Number.isFinite(v);}
  function validWind(d){return validNumber(d?.wind_speed_10m)&&d.wind_speed_10m>=0;}
  function windBand(speed){return WIND_STOPS[Math.min(5,Math.floor(speed/20))];}

  function fieldSpeed(field,x,y){
    const {size,data}=field;
    const col=Math.max(0,Math.min(size-1,x*size-.5));
    const row=Math.max(0,Math.min(size-1,y*size-.5));
    const left=Math.floor(col),top=Math.floor(row);
    const nearest=data[Math.round(row)*size+Math.round(col)];
    if(!validWind(nearest))return null;
    const corners=[
      data[top*size+left],data[top*size+Math.ceil(col)],
      data[Math.ceil(row)*size+left],data[Math.ceil(row)*size+Math.ceil(col)]
    ];
    if(!corners.every(d=>validWind(d)&&d._source===nearest._source))return nearest.wind_speed_10m;
    const [nw,ne,sw,se]=corners.map(d=>d.wind_speed_10m);
    const dx=col-left,dy=row-top;
    return (nw+(ne-nw)*dx)*(1-dy)+(sw+(se-sw)*dx)*dy;
  }

  function drawWind(field){
    const canvas=document.createElement('canvas');
    const size=128;
    canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d');
    const image=ctx.createImageData(size,size);
    const palette=WIND_STOPS.map(([,hex])=>[...hex.slice(1).match(/../g).map(byte=>parseInt(byte,16)),255]);
    for(let y=0;y<size;y++){
      for(let x=0;x<size;x++){
        const speed=fieldSpeed(field,(x+.5)/size,(y+.5)/size);
        if(speed===null)continue;
        image.data.set(palette[WIND_STOPS.indexOf(windBand(speed))],(y*size+x)*4);
      }
    }
    ctx.putImageData(image,0,0);
    L.imageOverlay(canvas.toDataURL(),field.bounds,{opacity:.48,interactive:false,alt:''}).addTo(overlay);
  }

  function showWindDetails({latlng}){
    if(mode!=='wind'||!windField)return;
    const {nw,se,zoom,size,data}=windField;
    const p=getMap().project(latlng,zoom);
    const x=(p.x-nw.x)/(se.x-nw.x),y=(p.y-nw.y)/(se.y-nw.y);
    if(x<0||x>=1||y<0||y>=1)return;
    const sample=data[Math.floor(y*size)*size+Math.floor(x*size)];
    const speed=fieldSpeed(windField,x,y);
    const detail=document.createElement('div');
    detail.style.whiteSpace='pre-line';
    detail.textContent=speed===null?'Vent indisponible à cet endroit.':[
      `Vent moyen estimé à 10 m · ${Math.round(speed)} km/h`,
      `Rafales au point échantillonné · ${validNumber(sample.wind_gusts_10m)?Math.round(sample.wind_gusts_10m)+' km/h':'indisponibles'}`,
      sample._source+' via Open-Meteo',
      sample.time?`Prévision locale · ${sample.time.replace('T',' à ')}`:'Heure indisponible'
    ].join('\n');
    windPopup=L.popup({className:'v50-wind-popup',minWidth:210,maxWidth:240}).setLatLng(latlng).setContent(detail).openOn(getMap());
  }
  function windLegend(data){
    const el=document.getElementById('v50LayerLegend');if(!el)return;
    const valid=data.filter(validWind),sources=[...new Set(valid.map(d=>d._source))].join(' / ');
    el.textContent=valid.length?'Vent moyen à 10 m • '+sources+' via Open-Meteo • carte interpolée ('+valid.length+'/'+data.length+' points), toucher pour les détails. ':'Vent indisponible sur cette zone. Réessaie dans quelques instants. ';
    const scale=document.createElement('div');scale.className='v50-wind-scale';scale.setAttribute('aria-label','Vent moyen en km/h');
    scale.innerHTML=WIND_STOPS.map(([,color,label])=>'<span><i style="background:'+color+'"></i>'+label+' km/h</span>').join('');el.appendChild(scale);
  }

  function markerHtml(d){
    if(mode==='snow'){
      const snow=Number(d.snowfall)||0;return `<div class="v50-weather-marker snow">❄️ ${snow.toFixed(snow<1?1:0)} cm</div>`;
    }
    const t=Number(d.temperature_2m),cls=t<=5?'temp-cold':t>=25?'temp-hot':'temp-mild';return `<div class="v50-weather-marker ${cls}">🌡️ ${Number.isFinite(t)?Math.round(t):'--'}°</div>`;
  }

  async function renderOverlay(){
    const m=getMap();if(!m||!window.L)return;
    clearOverlay(true);
    const pending=new AbortController();
    request=pending;
    const field=samplePoints();
    if(field.se.x<=field.nw.x||field.se.y<=field.nw.y)return;
    setLegend(mode==='wind'?'Chargement du vent Météo-France AROME HD…':mode==='snow'?'Chargement de la neige Météo-France…':'Chargement de la température Météo-France…');
    const data=await fetchPoints(field.points,pending.signal).catch(()=>field.points.map(()=>({})));
    if(request!==pending)return;
    request=null;
    overlay=L.layerGroup().addTo(m);
    if(mode==='wind'){
      windField={...field,data};
      if(data.some(validWind))drawWind(windField);
      windLegend(data);
      return;
    }
    data.forEach((d,index)=>{
      if(mode==='snow'&&(Number(d?.snowfall)||0)<=0)return;
      if(!usableCurrent(d))return;
      const p=field.points[index];
      const icon=L.divIcon({className:'',html:markerHtml(d),iconSize:null,iconAnchor:[20,20]});
      L.marker([p.lat,p.lon],{icon,interactive:false}).addTo(overlay);
    });
    if(!data.some(d=>usableCurrent(d)))setLegend('Données météo indisponibles sur cette zone.');
    else if(mode==='snow'&&overlay.getLayers().length===0)setLegend('❄️ Aucune chute de neige détectée actuellement sur la zone visible.');
    else if(mode==='snow')setLegend('❄️ Neige actuelle • données Météo-France AROME.');
    else setLegend('🌡️ Température actuelle • données Météo-France AROME.');
  }

  function bindMap(){
    const m=getMap();if(!m||m.__v50LayersBound)return false;m.__v50LayersBound=true;
    m.on('click',showWindDetails);
    m.on('movestart',()=>{if(mode!=='rain'){clearTimeout(refreshTimer);request?.abort();request=null;}});
    m.on('moveend',()=>{if(mode==='rain'||getPanel().hidden)return;clearTimeout(refreshTimer);refreshTimer=setTimeout(renderOverlay,350);});
    return true;
  }

  function boot(){
    inject();bindMap();
    new MutationObserver(()=>{
      if(mode==='rain')return;
      clearTimeout(refreshTimer);
      if(getPanel().hidden)clearOverlay();
      else refreshTimer=setTimeout(renderOverlay,350);
    }).observe(getPanel(),{attributes:true,attributeFilter:['hidden']});
    const saved=localStorage.getItem('meteo-app-v50-map-layer');if(['rain','snow','wind','temp'].includes(saved))mode=saved;
    setMode(mode);
  }
  let tries=0;const timer=setInterval(()=>{inject();if(bindMap()&&getPanel()){clearInterval(timer);boot();}if(++tries>30)clearInterval(timer);},300);
})();
