// Météo V5 — Additional weather map layers (rain, snow, wind, temperature)
(function initV50RadarLayers(){
  let overlay=null;
  let mode='rain';
  let refreshTimer=null;
  const CACHE=new Map();

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
    .v50-wind-marker{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:40px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.75);font-weight:900;font-size:.68rem;white-space:nowrap;pointer-events:none}
    .v50-wind-arrow-wrap{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:rgba(15,23,42,.64);border:1px solid rgba(255,255,255,.35);box-shadow:0 4px 13px rgba(0,0,0,.2);backdrop-filter:blur(5px)}
    .v50-wind-arrow{font-size:1.45rem;line-height:1;display:block;transform-origin:center;animation:v50WindFlow 1.35s ease-in-out infinite}
    .v50-wind-speed{padding:2px 5px;border-radius:999px;background:rgba(15,23,42,.62)}
    @keyframes v50WindFlow{0%,100%{translate:0 1px;opacity:.72}50%{translate:0 -3px;opacity:1}}
    @media(prefers-reduced-motion:reduce){.v50-wind-arrow{animation:none}}
    @media(max-width:600px){.v50-layer-switcher{overflow-x:auto;flex-wrap:nowrap;padding-bottom:3px}.v50-layer-switcher button{flex:0 0 auto}.v50-wind-arrow-wrap{width:31px;height:31px}.v50-wind-arrow{font-size:1.3rem}}
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

  function setLegend(text){const el=document.getElementById('v50LayerLegend');if(el)el.textContent=text;}
  function clearOverlay(){const m=getMap();if(m&&overlay){try{m.removeLayer(overlay);}catch{}}overlay=null;}

  function samplePoints(){
    const m=getMap();if(!m)return[];
    const b=m.getBounds(),south=b.getSouth(),north=b.getNorth(),west=b.getWest(),east=b.getEast();
    const zoom=Number(m.getZoom?.()||7);
    const rows=mode==='wind'?(zoom>=9?6:5):3;
    const cols=mode==='wind'?(zoom>=9?6:5):3;
    const pts=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)pts.push({lat:south+(north-south)*(r+.5)/rows,lon:west+(east-west)*(c+.5)/cols});
    return pts;
  }

  async function fetchPoint(p){
    const key=`${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;const hit=CACHE.get(key);if(hit&&Date.now()-hit.time<10*60*1000)return hit.data;
    const u=new URL('https://api.open-meteo.com/v1/forecast');
    u.searchParams.set('latitude',p.lat);u.searchParams.set('longitude',p.lon);u.searchParams.set('timezone','auto');
    u.searchParams.set('current','temperature_2m,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m');
    const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error('Données météo indisponibles');const d=await r.json();CACHE.set(key,{time:Date.now(),data:d.current||{}});return d.current||{};
  }

  function markerHtml(d,index=0){
    if(mode==='wind'){
      const speed=Math.round(Number(d.wind_speed_10m)||0),gust=Math.round(Number(d.wind_gusts_10m)||0),dir=Number(d.wind_direction_10m)||0;
      const delay=-((index%7)*.13).toFixed(2);
      return `<div class="v50-wind-marker" title="Vent ${speed} km/h · rafales ${gust} km/h"><span class="v50-wind-arrow-wrap" style="transform:rotate(${dir}deg)"><span class="v50-wind-arrow" style="animation-delay:${delay}s">↑</span></span><span class="v50-wind-speed">${speed} km/h</span></div>`;
    }
    if(mode==='snow'){
      const snow=Number(d.snowfall)||0;return `<div class="v50-weather-marker snow">❄️ ${snow.toFixed(snow<1?1:0)} cm</div>`;
    }
    const t=Number(d.temperature_2m),cls=t<=5?'temp-cold':t>=25?'temp-hot':'temp-mild';return `<div class="v50-weather-marker ${cls}">🌡️ ${Number.isFinite(t)?Math.round(t):'--'}°</div>`;
  }

  async function renderOverlay(){
    const m=getMap();if(!m||!window.L)return;
    clearOverlay();overlay=L.layerGroup().addTo(m);
    const pts=samplePoints();
    setLegend(mode==='wind'?'Vent à 10 m : flèches orientées selon la direction, vitesse affichée et rafales au survol.':mode==='snow'?'Neige actuelle estimée sur la zone visible.':'Température actuelle sur la zone visible.');
    const token=Date.now();renderOverlay.token=token;
    await Promise.all(pts.map(async (p,index)=>{try{const d=await fetchPoint(p);if(renderOverlay.token!==token||!overlay)return;if(mode==='snow'&&(Number(d.snowfall)||0)<=0)return;const icon=L.divIcon({className:'',html:markerHtml(d,index),iconSize:null,iconAnchor:[20,20]});L.marker([p.lat,p.lon],{icon,interactive:false}).addTo(overlay);}catch{}}));
    if(mode==='snow'&&overlay&&overlay.getLayers().length===0)setLegend('❄️ Aucune chute de neige détectée actuellement sur la zone visible.');
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
