// Météo V5 — Additional weather map layers (rain, snow, wind, temperature)
(function initV50RadarLayers(){
  let overlay=null;
  let mode='rain';
  let refreshTimer=null;
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
    .v50-weather-marker .arrow{font-size:1.05rem;margin-right:4px;display:inline-block}
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
    const legend=document.createElement('div');legend.id='v50LayerLegend';legend.className='v50-layer-legend';legend.textContent='Radar de précipitations en direct.';
    box.insertAdjacentElement('afterend',legend);
    box.addEventListener('click',e=>{const b=e.target.closest('[data-v50-layer]');if(!b)return;setMode(b.dataset.v50Layer);});
  }

  function setMode(next){
    mode=next;
    localStorage.setItem('meteo-app-v50-map-layer',mode);
    document.querySelectorAll('#v50LayerSwitcher [data-v50-layer]').forEach(b=>b.classList.toggle('active',b.dataset.v50Layer===mode));
    const controls=document.querySelector('.radar-controls'),play=document.getElementById('radarPlayBtn');
    const rain=mode==='rain';if(controls)controls.style.display=rain?'':'none';if(play)play.style.display=rain?'':'none';
    clearOverlay();
    if(rain){try{showUnifiedRadar?.();}catch{};setLegend('Radar de précipitations en direct.');return;}
    renderOverlay();
  }

  function mRemoveRadar(){const m=getMap();if(m&&typeof radarLayer!=='undefined'&&radarLayer)m.removeLayer(radarLayer);}
  function setLegend(text){const el=document.getElementById('v50LayerLegend');if(el)el.textContent=text;}
  function clearOverlay(){renderOverlay.token=(renderOverlay.token||0)+1;const m=getMap();if(m&&overlay){try{m.removeLayer(overlay);}catch{}}overlay=null;}

  function samplePoints(){
    const m=getMap();if(!m)return[];
    const b=m.getBounds(),south=b.getSouth(),north=b.getNorth(),west=b.getWest(),east=b.getEast();
    const zoom=Number(m.getZoom?.()||7);
    const rows=mode==='wind'?(zoom>=9?6:5):3;
    const cols=mode==='wind'?(zoom>=9?6:5):3;
    const pts=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)pts.push({lat:south+(north-south)*(r+.5)/rows,lon:west+(east-west)*(c+.5)/cols,bounds:[[south+(north-south)*r/rows,west+(east-west)*c/cols],[south+(north-south)*(r+1)/rows,west+(east-west)*(c+1)/cols]]});
    return pts;
  }

  function cacheKey(p){return`${mode}:${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;}
  function usableCurrent(d,layerMode=mode){
    if(!d||typeof d!=='object')return false;
    return layerMode==='wind'?validWind(d):[d.temperature_2m,d.snowfall].some(validNumber);
  }

  async function requestBatch(points,url,model){
    if(!points.length)return[];
    const u=new URL(url);
    u.searchParams.set('latitude',points.map(p=>p.lat.toFixed(5)).join(','));
    u.searchParams.set('longitude',points.map(p=>p.lon.toFixed(5)).join(','));
    u.searchParams.set('timezone','auto');
    u.searchParams.set('wind_speed_unit','kmh');
    u.searchParams.set('current','temperature_2m,snowfall,wind_speed_10m,wind_gusts_10m');
    if(model)u.searchParams.set('models',model);
    const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(`Météo HTTP ${r.status}`);
    const json=await r.json(),arr=Array.isArray(json)?json:[json];
    return points.map((p,i)=>arr[i]?.current||{});
  }

  async function fetchPoints(points){
    const requestedMode=mode;
    const out=new Array(points.length),missing=[];
    points.forEach((p,i)=>{const hit=CACHE.get(cacheKey(p));if(hit&&Date.now()-hit.time<10*60*1000)out[i]=hit.data;else missing.push({p,i});});
    if(!missing.length)return out;

    let primary=[];
    try{primary=await requestBatch(missing.map(x=>x.p),METEOFRANCE_URL,AROME_HD);}catch{}
    const second=[];
    missing.forEach((entry,j)=>{
      const d=primary[j];
      if(usableCurrent(d,requestedMode)){out[entry.i]={...d,_source:'AROME France HD'};}
      else second.push(entry);
    });

    let seamless=[];
    if(second.length){try{seamless=await requestBatch(second.map(x=>x.p),METEOFRANCE_URL,METEOFRANCE_SEAMLESS);}catch{}}
    const third=[];
    second.forEach((entry,j)=>{
      const d=seamless[j];
      if(usableCurrent(d,requestedMode)){out[entry.i]={...d,_source:'Météo-France'};}
      else third.push(entry);
    });

    let generic=[];
    if(third.length){try{generic=await requestBatch(third.map(x=>x.p),GENERIC_URL,null);}catch{}}
    third.forEach((entry,j)=>{const d=generic[j]||{};out[entry.i]={...d,_source:'Open-Meteo secours'};});

    if(mode!==requestedMode)return out;
    if(CACHE.size>500)CACHE.clear();
    missing.forEach(entry=>{const d=out[entry.i]||{};if(!usableCurrent(d))return;CACHE.set(cacheKey(entry.p),{time:Date.now(),data:d});});
    return out;
  }

  const WIND_STOPS=[[0,'#2563eb','0–19'],[20,'#22c55e','20–39'],[40,'#facc15','40–59'],[60,'#f97316','60–79'],[80,'#ef4444','80–99'],[100,'#a855f7','100+']];
  function validNumber(v){return typeof v==='number'&&Number.isFinite(v);}
  function validWind(d){return validNumber(d?.wind_speed_10m)&&d.wind_speed_10m>=0;}
  function windColor(speed){return [...WIND_STOPS].reverse().find(([min])=>speed>=min)[1];}
  function windLegend(data){
    const el=document.getElementById('v50LayerLegend');if(!el)return;
    const valid=data.filter(validWind),sources=[...new Set(valid.map(d=>d._source))].join(' / ');
    el.textContent=valid.length?'Vent moyen à 10 m • '+sources+' via Open-Meteo • zones échantillonnées ('+valid.length+'/'+data.length+'), toucher pour les détails. ':'Vent indisponible sur cette zone. Réessaie dans quelques instants. ';
    const scale=document.createElement('div');scale.className='v50-wind-scale';scale.setAttribute('aria-label','Vent moyen en km/h');
    scale.innerHTML=WIND_STOPS.map(([,color,label])=>'<span><i style="background:'+color+'"></i>'+label+' km/h</span>').join('');el.appendChild(scale);
  }

  function markerHtml(d,index=0){
    if(mode==='snow'){
      const snow=Number(d.snowfall)||0;return `<div class="v50-weather-marker snow">❄️ ${snow.toFixed(snow<1?1:0)} cm</div>`;
    }
    const t=Number(d.temperature_2m),cls=t<=5?'temp-cold':t>=25?'temp-hot':'temp-mild';return `<div class="v50-weather-marker ${cls}">🌡️ ${Number.isFinite(t)?Math.round(t):'--'}°</div>`;
  }

  async function renderOverlay(){
    const m=getMap();if(!m||!window.L)return;
    clearOverlay();overlay=L.layerGroup().addTo(m);
    const pts=samplePoints();
    setLegend(mode==='wind'?'Chargement du vent Météo-France AROME HD…':mode==='snow'?'Chargement de la neige Météo-France…':'Chargement de la température Météo-France…');
    const token=renderOverlay.token;
    const data=await fetchPoints(pts).catch(()=>pts.map(()=>({})));
    if(renderOverlay.token!==token||!overlay)return;
    let aromeCount=0;
    data.forEach((d,index)=>{
      if(d?._source==='AROME France HD')aromeCount++;
      if(mode==='snow'&&(Number(d?.snowfall)||0)<=0)return;
      if(!usableCurrent(d))return;
      const p=pts[index];
      if(mode==='wind'){
        if(!validWind(d))return;
        const gust=validNumber(d.wind_gusts_10m)?Math.round(d.wind_gusts_10m)+' km/h':'indisponibles';
        L.rectangle(p.bounds,{stroke:false,fillColor:windColor(d.wind_speed_10m),fillOpacity:.48,interactive:true,bubblingMouseEvents:false})
          .bindPopup('<strong>Vent moyen : '+Math.round(d.wind_speed_10m)+' km/h</strong><br>Rafales : '+gust+'<br>'+d._source+'<br>Prévision : '+(d.time||'heure indisponible')+'<br><small>Zone échantillonnée • vent à 10 m</small>').addTo(overlay);
        return;
      }
      const icon=L.divIcon({className:'',html:markerHtml(d,index),iconSize:null,iconAnchor:[20,20]});
      L.marker([p.lat,p.lon],{icon,interactive:false}).addTo(overlay);
    });
    if(mode==='wind')windLegend(data);
    else if(mode==='snow'&&overlay&&overlay.getLayers().length===0)setLegend('❄️ Aucune chute de neige détectée actuellement sur la zone visible.');
    else if(mode==='snow')setLegend('❄️ Neige actuelle • données Météo-France AROME.');
    else setLegend('🌡️ Température actuelle • données Météo-France AROME.');
  }

  function bindMap(){
    const m=getMap();if(!m||m.__v50LayersBound)return false;m.__v50LayersBound=true;
    m.on('moveend zoomend',()=>{if(mode==='rain')return;clearTimeout(refreshTimer);refreshTimer=setTimeout(renderOverlay,350);});return true;
  }

  function boot(){
    inject();bindMap();
    const saved=localStorage.getItem('meteo-app-v50-map-layer');if(['rain','snow','wind','temp'].includes(saved))mode=saved;
    setMode(mode);
  }
  let tries=0;const timer=setInterval(()=>{inject();if(bindMap()&&getPanel()){clearInterval(timer);boot();}if(++tries>30)clearInterval(timer);},300);
})();
