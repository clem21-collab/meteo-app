const V41_VERSION='4.1';
const V41_GEO_URL='https://geo.api.gouv.fr/communes';
const V41_FORECAST_URL='https://api.open-meteo.com/v1/forecast';
const V41_BACKEND=typeof PUSH_BACKEND!=='undefined'?PUSH_BACKEND:'https://meteo-push.clemret17.workers.dev';
let v41Details=null;
let v41DetailsKey='';
let v41RefreshTimer=null;
let v41OriginalLoadWeather=null;

(function initV41(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v41.css?v=${V41_VERSION}`;document.head.appendChild(css);

  const boot=()=>{
    if(typeof window.loadWeather!=='function'||!document.getElementById('panel-weather'))return setTimeout(boot,250);
    injectV41WeatherUi();
    injectV41AlertControls();
    patchV41LoadWeather();
    bindV41AlertControls();
    setTimeout(()=>refreshV41All(true),500);
  };
  boot();
})();

function v41LocationKey(){
  if(typeof currentPlace==='undefined'||!currentPlace)return'';
  return`${Number(currentPlace.latitude).toFixed(4)},${Number(currentPlace.longitude).toFixed(4)}`;
}

async function resolveV41Commune(lat,lon){
  try{
    const url=new URL(V41_GEO_URL);
    url.searchParams.set('lat',Number(lat));
    url.searchParams.set('lon',Number(lon));
    url.searchParams.set('fields','nom,code,codeDepartement,departement,codesPostaux');
    url.searchParams.set('format','json');
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)return null;
    const data=await response.json();
    const commune=Array.isArray(data)?data[0]:null;
    if(!commune?.nom)return null;
    return{
      name:commune.nom,
      admin1:commune.departement?.nom||'',
      country:'France',
      communeCode:commune.code||'',
      departmentCode:commune.codeDepartement||commune.departement?.code||'',
      postalCode:Array.isArray(commune.codesPostaux)?commune.codesPostaux[0]||'':'',
      latitude:Number(lat),longitude:Number(lon)
    };
  }catch(error){console.warn('Commune reverse lookup',error);return null;}
}

function injectV41WeatherUi(){
  const panel=document.getElementById('panel-weather');
  const hero=panel?.querySelector('.hero');
  if(!panel||!hero||document.getElementById('v41SmartSummary'))return;

  const smart=document.createElement('section');
  smart.id='v41SmartSummary';
  smart.className='v41-smart-card glass-card';
  smart.innerHTML=`
    <div class="v41-smart-icon" id="v41SmartIcon">🌦️</div>
    <div class="v41-smart-copy">
      <span class="section-label">À SAVOIR MAINTENANT</span>
      <strong id="v41SmartTitle">Analyse de la météo…</strong>
      <small id="v41SmartDetail">Prévision pluie à 15 minutes</small>
    </div>
    <span id="v41SmartBadge" class="v41-smart-badge">--</span>`;
  hero.insertAdjacentElement('beforebegin',smart);

  const vig=document.createElement('section');
  vig.id='v41VigilanceCard';
  vig.className='v41-vigilance-card glass-card';
  vig.innerHTML=`
    <div class="v41-vig-head">
      <div><span class="section-label">VIGILANCE OFFICIELLE</span><h3 id="v41VigTitle">Météo-France</h3></div>
      <span id="v41VigColor" class="v41-vig-color">Chargement…</span>
    </div>
    <div id="v41VigPhenomena" class="v41-vig-phenomena"></div>
    <small id="v41VigMeta" class="muted">Recherche du département…</small>`;
  smart.insertAdjacentElement('afterend',vig);

  const dailySection=document.getElementById('daily')?.closest('.section');
  const graph=document.createElement('section');
  graph.id='v41ChartSection';
  graph.className='section v41-chart-section';
  graph.innerHTML=`
    <div class="section-heading">
      <div><h2>Prochaines 24 heures</h2><p class="muted">Température • risque de pluie • vent</p></div>
      <div class="v41-chart-legend"><span>🌡️ Temp.</span><span>💧 Pluie</span><span>💨 Vent</span></div>
    </div>
    <div class="glass-card v41-chart-card">
      <div id="v41Chart" class="v41-chart"><div class="empty-state">Chargement du graphique…</div></div>
      <div id="v41ChartStats" class="v41-chart-stats"></div>
    </div>`;
  if(dailySection)dailySection.insertAdjacentElement('beforebegin',graph);else panel.appendChild(graph);
}

function injectV41AlertControls(){
  const panel=document.getElementById('panel-alerts');
  const settings=panel?.querySelector('.alerts-card:nth-of-type(2)')||panel?.querySelectorAll('.alerts-card')?.[1];
  if(!settings||document.getElementById('v41RainSoonWindow'))return;

  const block=document.createElement('div');
  block.className='v41-alert-extra';
  block.innerHTML=`
    <div class="v41-alert-divider"><span>Alertes précises</span></div>
    <label class="setting-row">
      <span><strong>Pluie imminente</strong><small>Prévenir seulement selon tes critères</small></span>
      <input id="v41RainSoonToggle" type="checkbox" checked>
    </label>
    <label class="setting-block" for="v41RainSoonWindow">
      <span><strong>Délai maximum</strong><small id="v41RainSoonWindowLabel">30 min</small></span>
      <input id="v41RainSoonWindow" type="range" min="15" max="60" value="30" step="15">
    </label>
    <label class="setting-block" for="v41RainIntensity">
      <span><strong>Intensité minimale</strong><small>Pour déclencher l’alerte</small></span>
      <select id="v41RainIntensity">
        <option value="0.1">Pluie faible</option>
        <option value="0.5">Pluie modérée</option>
        <option value="1.5">Pluie forte</option>
      </select>
    </label>
    <label class="setting-row">
      <span><strong>Vigilance Météo-France</strong><small>Alerte officielle du département</small></span>
      <input id="v41VigilanceToggle" type="checkbox" checked>
    </label>
    <label class="setting-block" for="v41VigilanceLevel">
      <span><strong>À partir du niveau</strong><small id="v41VigilanceLevelLabel">Orange</small></span>
      <select id="v41VigilanceLevel">
        <option value="2">Jaune</option>
        <option value="3" selected>Orange</option>
        <option value="4">Rouge</option>
      </select>
    </label>`;
  settings.appendChild(block);
  syncV41AlertControls();
}

function readV41Settings(){
  let saved={};
  try{saved=JSON.parse(localStorage.getItem('meteo-app-alert-settings-v3')||'{}')||{};}catch{}
  return{
    rainSoon:saved.rainSoon!==false,
    rainSoonMinutes:Math.max(15,Math.min(60,Number(saved.rainSoonMinutes??30))),
    rainSoonMinMm:[0.1,0.5,1.5].includes(Number(saved.rainSoonMinMm))?Number(saved.rainSoonMinMm):0.1,
    vigilance:saved.vigilance!==false,
    vigilanceLevel:Math.max(2,Math.min(4,Number(saved.vigilanceLevel??3)))
  };
}

function writeV41Settings(patch){
  let saved={};
  try{saved=JSON.parse(localStorage.getItem('meteo-app-alert-settings-v3')||'{}')||{};}catch{}
  const next={...saved,...patch};
  localStorage.setItem('meteo-app-alert-settings-v3',JSON.stringify(next));
  return next;
}

function syncV41AlertControls(){
  const s=readV41Settings();
  const by=id=>document.getElementById(id);
  if(by('v41RainSoonToggle'))by('v41RainSoonToggle').checked=s.rainSoon;
  if(by('v41RainSoonWindow'))by('v41RainSoonWindow').value=String(s.rainSoonMinutes);
  if(by('v41RainSoonWindowLabel'))by('v41RainSoonWindowLabel').textContent=`${s.rainSoonMinutes} min`;
  if(by('v41RainIntensity'))by('v41RainIntensity').value=String(s.rainSoonMinMm);
  if(by('v41VigilanceToggle'))by('v41VigilanceToggle').checked=s.vigilance;
  if(by('v41VigilanceLevel'))by('v41VigilanceLevel').value=String(s.vigilanceLevel);
  const names={2:'Jaune',3:'Orange',4:'Rouge'};
  if(by('v41VigilanceLevelLabel'))by('v41VigilanceLevelLabel').textContent=names[s.vigilanceLevel]||'Orange';
}

function bindV41AlertControls(){
  const ids=['v41RainSoonToggle','v41RainSoonWindow','v41RainIntensity','v41VigilanceToggle','v41VigilanceLevel'];
  ids.forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{
    const by=x=>document.getElementById(x);
    const patch={
      rainSoon:by('v41RainSoonToggle')?.checked??true,
      rainSoonMinutes:Number(by('v41RainSoonWindow')?.value||30),
      rainSoonMinMm:Number(by('v41RainIntensity')?.value||0.1),
      vigilance:by('v41VigilanceToggle')?.checked??true,
      vigilanceLevel:Number(by('v41VigilanceLevel')?.value||3)
    };
    writeV41Settings(patch);syncV41AlertControls();
    if(typeof refreshPushSettingsSilently==='function')refreshPushSettingsSilently();
  }));
  document.getElementById('v41RainSoonWindow')?.addEventListener('input',e=>{
    const label=document.getElementById('v41RainSoonWindowLabel');if(label)label.textContent=`${e.target.value} min`;
  });
}

function patchV41LoadWeather(){
  if(window.__v41LoadWeatherPatched)return;
  window.__v41LoadWeatherPatched=true;
  v41OriginalLoadWeather=window.loadWeather;
  window.loadWeather=async function(lat,lon,place=null){
    const resolved=await resolveV41Commune(lat,lon);
    const supplied=place?{...place}:null;
    const enriched=resolved?{
      ...(supplied||{}),
      name:supplied?.name&&supplied.name!=='Ma position'?supplied.name:resolved.name,
      admin1:supplied?.admin1||resolved.admin1,
      country:supplied?.country||resolved.country,
      latitude:Number(lat),longitude:Number(lon)
    }:place;
    const result=await v41OriginalLoadWeather(lat,lon,enriched);
    if(typeof currentPlace!=='undefined'&&currentPlace){
      if(resolved){
        currentPlace.name=enriched?.name||resolved.name;
        currentPlace.admin1=enriched?.admin1||resolved.admin1;
        currentPlace.country=enriched?.country||'France';
        currentPlace.departmentCode=resolved.departmentCode;
        currentPlace.communeCode=resolved.communeCode;
        currentPlace.postalCode=resolved.postalCode;
        const name=document.getElementById('placeName'),detail=document.getElementById('placeDetail');
        if(name)name.textContent=currentPlace.name;
        if(detail)detail.textContent=[currentPlace.postalCode,currentPlace.admin1].filter(Boolean).join(' • ')||'Position actuelle';
      }
    }
    v41Details=null;v41DetailsKey='';
    clearTimeout(v41RefreshTimer);
    v41RefreshTimer=setTimeout(()=>refreshV41All(true),100);
    return result;
  };

  if(typeof currentPlace!=='undefined'&&currentPlace){
    resolveV41Commune(currentPlace.latitude,currentPlace.longitude).then(resolved=>{
      if(!resolved||!currentPlace)return;
      if(currentPlace.name==='Ma position')currentPlace.name=resolved.name;
      currentPlace.departmentCode=resolved.departmentCode;
      currentPlace.communeCode=resolved.communeCode;
      currentPlace.postalCode=resolved.postalCode;
      currentPlace.admin1=currentPlace.admin1||resolved.admin1;
      const name=document.getElementById('placeName'),detail=document.getElementById('placeDetail');
      if(name)name.textContent=currentPlace.name;
      if(detail)detail.textContent=[currentPlace.postalCode,currentPlace.admin1].filter(Boolean).join(' • ');
      refreshV41All(true);
    });
  }
}

async function fetchV41Details(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)return null;
  const key=v41LocationKey();
  if(!force&&v41Details&&v41DetailsKey===key)return v41Details;
  const url=new URL(V41_FORECAST_URL);
  url.searchParams.set('latitude',currentPlace.latitude);
  url.searchParams.set('longitude',currentPlace.longitude);
  url.searchParams.set('timezone','auto');
  url.searchParams.set('forecast_days','2');
  url.searchParams.set('hourly','temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code');
  url.searchParams.set('minutely_15','precipitation,rain,weather_code');
  url.searchParams.set('forecast_minutely_15','16');
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`Prévision détaillée ${response.status}`);
  v41Details=await response.json();v41DetailsKey=key;
  return v41Details;
}

function v41Intensity(mm){
  const n=Number(mm||0);
  if(n<0.1)return{label:'aucune',short:'Sec',emoji:'☀️'};
  if(n<0.5)return{label:'faible',short:'Faible',emoji:'🌦️'};
  if(n<1.5)return{label:'modérée',short:'Modérée',emoji:'🌧️'};
  if(n<4)return{label:'forte',short:'Forte',emoji:'🌧️'};
  return{label:'très forte',short:'Très forte',emoji:'⛈️'};
}

function renderV41Smart(data){
  const m=data?.minutely_15;if(!m?.time?.length)return;
  const now=Date.now();
  let start=m.time.findIndex(t=>new Date(t).getTime()>=now-15*60000);if(start<0)start=0;
  const amount=i=>Number(m.rain?.[i]??m.precipitation?.[i]??0);
  const current=amount(start);
  let title='',detail='',badge='',icon='🌦️';

  if(current>=0.1){
    let end=start;while(end+1<m.time.length&&amount(end+1)>=0.1)end++;
    const minutes=Math.max(15,(end-start+1)*15);
    const intensity=v41Intensity(Math.max(...Array.from({length:end-start+1},(_,k)=>amount(start+k))));
    title=`Pluie ${intensity.label} en cours`;
    detail=`Encore environ ${minutes} min selon la prévision à 15 min.`;
    badge='EN COURS';icon=intensity.emoji;
  }else{
    let first=-1;for(let i=start+1;i<m.time.length;i++){if(amount(i)>=0.1){first=i;break;}}
    if(first<0){title='Pas de pluie prévue dans les prochaines heures';detail='Aucun signal de précipitation sur la prévision immédiate.';badge='AU SEC';icon='☀️';}
    else{
      const when=new Date(m.time[first]).getTime();
      const mins=Math.max(5,Math.round((when-now)/300000)*5);
      let end=first;while(end+1<m.time.length&&amount(end+1)>=0.1)end++;
      const duration=(end-first+1)*15;
      const peak=Math.max(...Array.from({length:end-first+1},(_,k)=>amount(first+k)));
      const intensity=v41Intensity(peak);
      if(mins<=60){title=`Pluie ${intensity.label} dans environ ${mins} min`;badge=`+${mins} MIN`;}
      else{title=`Pas de pluie dans l’heure`;badge='1 H AU SEC';}
      detail=mins<=60?`Durée estimée : environ ${duration} min.`:`Prochain signal de pluie vers ${new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(when))}.`;
      icon=intensity.emoji;
    }
  }
  const by=id=>document.getElementById(id);
  if(by('v41SmartTitle'))by('v41SmartTitle').textContent=title;
  if(by('v41SmartDetail'))by('v41SmartDetail').textContent=detail;
  if(by('v41SmartBadge'))by('v41SmartBadge').textContent=badge;
  if(by('v41SmartIcon'))by('v41SmartIcon').textContent=icon;
}

function renderV41Chart(data){
  const h=data?.hourly;if(!h?.time?.length)return;
  const now=Date.now();let start=h.time.findIndex(t=>new Date(t).getTime()>=now);if(start<0)start=0;
  const count=Math.min(24,h.time.length-start);
  const pts=Array.from({length:count},(_,k)=>{
    const i=start+k;return{
      time:h.time[i],temp:Number(h.temperature_2m?.[i]),rain:Number(h.precipitation_probability?.[i]||0),
      wind:Number(h.wind_speed_10m?.[i]||0),gust:Number(h.wind_gusts_10m?.[i]||0)
    };
  }).filter(p=>Number.isFinite(p.temp));
  if(!pts.length)return;
  const width=900,height=270,pad={l:34,r:18,t:24,b:42};
  const minT=Math.floor(Math.min(...pts.map(p=>p.temp))-2),maxT=Math.ceil(Math.max(...pts.map(p=>p.temp))+2);
  const x=i=>pad.l+(i/(Math.max(1,pts.length-1)))*(width-pad.l-pad.r);
  const yT=t=>pad.t+(maxT-t)/(Math.max(1,maxT-minT))*(height-pad.t-pad.b);
  const chartBottom=height-pad.b;
  const path=pts.map((p,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${yT(p.temp).toFixed(1)}`).join(' ');
  const rainBars=pts.map((p,i)=>{const bw=Math.max(8,(width-pad.l-pad.r)/pts.length*.58),bh=(p.rain/100)*95;return`<rect class="v41-rain-bar" x="${(x(i)-bw/2).toFixed(1)}" y="${(chartBottom-bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4"><title>${Math.round(p.rain)} % de pluie</title></rect>`}).join('');
  const dots=pts.map((p,i)=>`<circle class="v41-temp-dot" cx="${x(i).toFixed(1)}" cy="${yT(p.temp).toFixed(1)}" r="3"><title>${p.temp.toFixed(1)} °C</title></circle>`).join('');
  const labels=pts.map((p,i)=>i%3===0?`<text class="v41-hour-label" x="${x(i).toFixed(1)}" y="${height-14}" text-anchor="middle">${new Intl.DateTimeFormat('fr-FR',{hour:'2-digit'}).format(new Date(p.time))}h</text>`:'').join('');
  const temps=[minT,Math.round((minT+maxT)/2),maxT].map(t=>`<text class="v41-temp-label" x="4" y="${(yT(t)+4).toFixed(1)}">${t}°</text>`).join('');
  const svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Graphique météo des prochaines 24 heures"><line class="v41-grid" x1="${pad.l}" y1="${chartBottom}" x2="${width-pad.r}" y2="${chartBottom}"/>${rainBars}<path class="v41-temp-line" d="${path}" fill="none"/>${dots}${labels}${temps}</svg>`;
  const el=document.getElementById('v41Chart');if(el)el.innerHTML=svg;
  const stats=document.getElementById('v41ChartStats');
  if(stats){const maxRain=Math.max(...pts.map(p=>p.rain)),maxWind=Math.max(...pts.map(p=>p.gust||p.wind)),minTemp=Math.min(...pts.map(p=>p.temp)),maxTemp=Math.max(...pts.map(p=>p.temp));stats.innerHTML=`<span>🌡️ ${Math.round(minTemp)}° → ${Math.round(maxTemp)}°</span><span>💧 max ${Math.round(maxRain)} %</span><span>💨 rafales max ${Math.round(maxWind)} km/h</span>`;}
}

async function renderV41Vigilance(force=false){
  const title=document.getElementById('v41VigTitle'),color=document.getElementById('v41VigColor'),phen=document.getElementById('v41VigPhenomena'),meta=document.getElementById('v41VigMeta');
  if(typeof currentPlace==='undefined'||!currentPlace)return;
  let department=currentPlace.departmentCode;
  if(!department){const resolved=await resolveV41Commune(currentPlace.latitude,currentPlace.longitude);department=resolved?.departmentCode;if(resolved&&currentPlace)currentPlace.departmentCode=department;}
  if(!department){if(color)color.textContent='Indisponible';return;}
  if(title)title.textContent=`Département ${department}`;
  if(color)color.textContent='Chargement…';
  try{
    const r=await fetch(`${V41_BACKEND}/vigilance?department=${encodeURIComponent(department)}${force?'&refresh=1':''}`,{cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok)throw new Error(d.error||`HTTP ${r.status}`);
    if(title)title.textContent=`${currentPlace.admin1||`Département ${department}`} • aujourd’hui`;
    if(color){color.textContent=`${d.maxColor}`;color.dataset.level=String(d.maxLevel||1);}
    const today=d.periods?.find(p=>p.term==='J')||d.periods?.[0];
    const active=(today?.phenomena||[]).filter(x=>Number(x.level)>=2);
    if(phen)phen.innerHTML=active.length?active.map(x=>`<span class="v41-vig-pill" data-level="${x.level}">${x.name} • ${x.color}</span>`).join(''):'<span class="v41-vig-pill" data-level="1">Aucun phénomène particulier</span>';
    if(meta)meta.textContent=`Source Météo-France • mise à jour ${d.updateTime?new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(d.updateTime)):'récente'}`;
  }catch(error){
    if(color){color.textContent='À activer';color.dataset.level='0';}
    if(phen)phen.innerHTML='';
    if(meta)meta.textContent=`Vigilance officielle indisponible : ${error.message}`;
  }
}

async function refreshV41All(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)return;
  try{const data=await fetchV41Details(force);renderV41Smart(data);renderV41Chart(data);}catch(error){console.warn('V4.1 detailed weather',error);}
  await renderV41Vigilance(force);
}
