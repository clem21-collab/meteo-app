const V44_VERSION='4.4';
const V44_AIR_URL='https://air-quality-api.open-meteo.com/v1/air-quality';
let v44AirData=null;
let v44AirKey='';
let v44RefreshTimer=null;
let v44OriginalLoadWeather=null;

(function initV44(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v44.css?v=${V44_VERSION}`;document.head.appendChild(css);

  const boot=()=>{
    if(typeof window.loadWeather!=='function'||!document.getElementById('panel-weather'))return setTimeout(boot,250);
    injectV44Ui();
    patchV44LoadWeather();
    observeV44Place();
    setTimeout(()=>refreshV44All(true),450);
  };
  boot();
})();

function v44PlaceKey(){
  if(typeof currentPlace==='undefined'||!currentPlace)return'';
  return`${Number(currentPlace.latitude).toFixed(4)},${Number(currentPlace.longitude).toFixed(4)}`;
}

function injectV44Ui(){
  const panel=document.getElementById('panel-weather');
  if(!panel)return;

  if(!document.getElementById('v44SkyAccent')){
    const accent=document.createElement('div');
    accent.id='v44SkyAccent';accent.className='v44-sky-accent';accent.setAttribute('aria-hidden','true');
    document.body.appendChild(accent);
  }

  if(!document.getElementById('v44DailyBrief')){
    const brief=document.createElement('section');
    brief.id='v44DailyBrief';brief.className='v44-brief glass-card';
    brief.innerHTML=`
      <div class="v44-brief-icon" id="v44BriefIcon">🌤️</div>
      <div class="v44-brief-main">
        <span class="section-label">AUJOURD’HUI EN BREF</span>
        <h2 id="v44BriefTitle">Résumé de la journée</h2>
        <p id="v44BriefText" class="muted">Analyse des prévisions…</p>
      </div>
      <div id="v44BriefStats" class="v44-brief-stats"></div>`;
    const smart=document.getElementById('v41SmartSummary');
    const hero=panel.querySelector('.hero');
    if(smart)smart.insertAdjacentElement('beforebegin',brief);
    else hero?.insertAdjacentElement('beforebegin',brief);
  }

  if(!document.getElementById('v44AirSection')){
    const section=document.createElement('section');
    section.id='v44AirSection';section.className='section v44-air-section';
    section.innerHTML=`
      <div class="section-heading v44-air-heading">
        <div><h2>Qualité de l’air & pollen</h2><p class="muted">AQI européen • particules • gaz • pollens</p></div>
        <span id="v44AqiBadge" class="v44-aqi-badge">Chargement…</span>
      </div>
      <div class="v44-air-grid">
        <article class="glass-card v44-air-card">
          <div class="v44-air-card-head"><span>🌬️</span><div><strong>Qualité de l’air</strong><small id="v44AqiLabel">Analyse en cours…</small></div></div>
          <div id="v44AirMetrics" class="v44-air-metrics"></div>
          <small id="v44AirMeta" class="muted">Données atmosphériques CAMS via Open-Meteo.</small>
        </article>
        <article class="glass-card v44-air-card">
          <div class="v44-air-card-head"><span>🌾</span><div><strong>Pollens</strong><small id="v44PollenLead">Concentrations prévues</small></div></div>
          <div id="v44PollenList" class="v44-pollen-list"></div>
          <small class="muted">Valeurs en grains/m³ • disponibilité selon la saison.</small>
        </article>
      </div>`;
    const chart=document.getElementById('v41ChartSection');
    const dailySection=document.getElementById('daily')?.closest('.section');
    if(chart)chart.insertAdjacentElement('afterend',section);
    else if(dailySection)dailySection.insertAdjacentElement('beforebegin',section);
    else panel.appendChild(section);
  }
}

function patchV44LoadWeather(){
  if(window.__v44LoadWeatherPatched)return;
  window.__v44LoadWeatherPatched=true;
  v44OriginalLoadWeather=window.loadWeather;
  window.loadWeather=async function(...args){
    const result=await v44OriginalLoadWeather(...args);
    v44AirData=null;v44AirKey='';
    clearTimeout(v44RefreshTimer);
    v44RefreshTimer=setTimeout(()=>refreshV44All(true),120);
    return result;
  };
}

function observeV44Place(){
  const place=document.getElementById('placeName');
  if(!place||!('MutationObserver'in window))return;
  let timer=null;
  new MutationObserver(()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{v44AirData=null;v44AirKey='';refreshV44All(true);},500);
  }).observe(place,{childList:true,characterData:true,subtree:true});
}

function applyV44Theme(){
  const isDay=Boolean(typeof currentData!=='undefined'&&currentData?.current?.is_day);
  document.body.classList.toggle('v44-day',isDay);
  document.body.classList.toggle('v44-night',!isDay);
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',isDay?'#6f8eea':'#101831');
  const accent=document.getElementById('v44SkyAccent');
  if(accent)accent.innerHTML=isDay?'<span class="v44-sun">☀</span><i class="v44-cloud c1"></i><i class="v44-cloud c2"></i>':'<span class="v44-moon">☾</span><i class="v44-star s1"></i><i class="v44-star s2"></i><i class="v44-star s3"></i><i class="v44-star s4"></i>';
}

function v44BriefAdvice(d,i){
  const precip=Number(d.precipitation_sum?.[i]||0),prob=Number(d.precipitation_probability_max?.[i]||0),gust=Number(d.wind_gusts_10m_max?.[i]||0),uv=Number(d.uv_index_max?.[i]||0);
  if(precip>=5||prob>=70)return{icon:'🌧️',text:'La pluie sera l’élément principal à surveiller aujourd’hui.'};
  if(gust>=60)return{icon:'💨',text:'Le vent sera marqué, surtout lors des rafales les plus fortes.'};
  if(uv>=6)return{icon:'☀️',text:'Journée lumineuse avec un indice UV assez élevé.'};
  if(prob<20)return{icon:'🌤️',text:'Journée plutôt calme et sèche selon les prévisions actuelles.'};
  return{icon:'⛅',text:'Conditions assez tranquilles avec quelques variations possibles dans la journée.'};
}

async function renderV44Brief(){
  const title=document.getElementById('v44BriefTitle'),text=document.getElementById('v44BriefText'),stats=document.getElementById('v44BriefStats'),icon=document.getElementById('v44BriefIcon');
  try{
    let details=null;
    if(typeof fetchV43DailyDetails==='function')details=await fetchV43DailyDetails(false);
    const d=details?.daily;
    if(!d?.time?.length)throw new Error('Prévision journalière indisponible');
    const i=0;
    const min=Number(d.temperature_2m_min?.[i]),max=Number(d.temperature_2m_max?.[i]),prob=Number(d.precipitation_probability_max?.[i]),precip=Number(d.precipitation_sum?.[i]),gust=Number(d.wind_gusts_10m_max?.[i]),uv=Number(d.uv_index_max?.[i]);
    const advice=v44BriefAdvice(d,i);
    if(icon)icon.textContent=advice.icon;
    if(title)title.textContent=advice.text;
    if(text){
      const sunrise=typeof v43Hour==='function'?v43Hour(d.sunrise?.[i]):'--:--';
      const sunset=typeof v43Hour==='function'?v43Hour(d.sunset?.[i]):'--:--';
      text.textContent=`Lever ${sunrise} • coucher ${sunset} • ${Number.isFinite(precip)?precip.toFixed(1):'--'} mm de précipitations prévues.`;
    }
    if(stats)stats.innerHTML=`
      <span><b>🌡️</b><strong>${Number.isFinite(min)?Math.round(min):'--'}° → ${Number.isFinite(max)?Math.round(max):'--'}°</strong><small>Températures</small></span>
      <span><b>💧</b><strong>${Number.isFinite(prob)?Math.round(prob):'--'} %</strong><small>Risque pluie</small></span>
      <span><b>💨</b><strong>${Number.isFinite(gust)?Math.round(gust):'--'} km/h</strong><small>Rafales max</small></span>
      <span><b>☀️</b><strong>${Number.isFinite(uv)?uv.toFixed(1):'--'}</strong><small>UV max</small></span>`;
  }catch(error){
    if(title)title.textContent='Résumé du jour indisponible';
    if(text)text.textContent='Les autres prévisions restent disponibles.';
  }
}

async function fetchV44Air(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)return null;
  const key=v44PlaceKey();
  if(!force&&v44AirData&&v44AirKey===key)return v44AirData;
  const url=new URL(V44_AIR_URL);
  url.searchParams.set('latitude',currentPlace.latitude);
  url.searchParams.set('longitude',currentPlace.longitude);
  url.searchParams.set('timezone','auto');
  url.searchParams.set('forecast_days','4');
  url.searchParams.set('current','european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen');
  url.searchParams.set('hourly','european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen');
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`Qualité de l’air ${response.status}`);
  v44AirData=await response.json();v44AirKey=key;
  return v44AirData;
}

function v44AqiInfo(value){
  const n=Number(value);
  if(!Number.isFinite(n))return{label:'Indisponible',level:0};
  if(n<=20)return{label:'Bon',level:1};
  if(n<=40)return{label:'Correct',level:2};
  if(n<=60)return{label:'Modéré',level:3};
  if(n<=80)return{label:'Mauvais',level:4};
  if(n<=100)return{label:'Très mauvais',level:5};
  return{label:'Extrêmement mauvais',level:6};
}

function v44Metric(label,value,unit,emoji){
  const n=Number(value);
  return`<div class="v44-air-metric"><span>${emoji} ${label}</span><strong>${Number.isFinite(n)?n.toFixed(n<10?1:0):'--'} <small>${unit}</small></strong></div>`;
}

function v44Next24Max(data,key){
  const h=data?.hourly;if(!h?.time?.length)return null;
  const now=Date.now();let start=h.time.findIndex(t=>new Date(t).getTime()>=now-60*60000);if(start<0)start=0;
  const end=Math.min(start+24,h.time.length);
  const values=(h[key]||[]).slice(start,end).map(Number).filter(Number.isFinite);
  return values.length?Math.max(...values):null;
}

function renderV44Air(data){
  const c=data?.current||{};
  const aqi=Number(c.european_aqi),info=v44AqiInfo(aqi);
  const badge=document.getElementById('v44AqiBadge'),label=document.getElementById('v44AqiLabel'),metrics=document.getElementById('v44AirMetrics');
  if(badge){badge.textContent=Number.isFinite(aqi)?`AQI ${Math.round(aqi)} • ${info.label}`:'AQI indisponible';badge.dataset.level=String(info.level);}
  if(label)label.textContent=info.label;
  if(metrics)metrics.innerHTML=
    v44Metric('PM2.5',c.pm2_5,'µg/m³','•')+
    v44Metric('PM10',c.pm10,'µg/m³','•')+
    v44Metric('NO₂',c.nitrogen_dioxide,'µg/m³','•')+
    v44Metric('Ozone',c.ozone,'µg/m³','•');

  const pollenDefs=[['alder_pollen','Aulne','🌳'],['birch_pollen','Bouleau','🌳'],['grass_pollen','Graminées','🌾'],['mugwort_pollen','Armoise','🌿'],['olive_pollen','Olivier','🫒'],['ragweed_pollen','Ambroisie','🌱']];
  const pollens=pollenDefs.map(([key,name,emoji])=>{
    const current=Number(c[key]);
    const max24=v44Next24Max(data,key);
    const value=Number.isFinite(current)?current:max24;
    return{key,name,emoji,value,max24};
  });
  const available=pollens.filter(p=>Number.isFinite(p.value));
  const maxScale=Math.max(1,...available.map(p=>Math.max(p.value,p.max24||0)));
  const list=document.getElementById('v44PollenList'),lead=document.getElementById('v44PollenLead');
  if(list){
    if(!available.length){
      list.innerHTML='<div class="v44-pollen-empty">Aucune donnée pollen disponible actuellement (hors saison possible).</div>';
    }else{
      list.innerHTML=available.map(p=>{
        const max=Number.isFinite(p.max24)?p.max24:p.value;
        const width=Math.max(2,Math.min(100,(max/maxScale)*100));
        return`<div class="v44-pollen-row"><div><span>${p.emoji}</span><strong>${p.name}</strong></div><div class="v44-pollen-values"><b>${Number.isFinite(p.value)?p.value.toFixed(p.value<10?1:0):'--'}</b><small>max 24 h ${Number.isFinite(max)?max.toFixed(max<10?1:0):'--'}</small></div><div class="v44-pollen-bar"><i style="width:${width.toFixed(1)}%"></i></div></div>`;
      }).join('');
    }
  }
  if(lead){
    const top=[...available].sort((a,b)=>(b.max24||b.value)-(a.max24||a.value))[0];
    lead.textContent=top&&Math.max(top.max24||0,top.value||0)>0?`Principal signal sur 24 h : ${top.name}`:'Pas de pollen notable dans les données disponibles';
  }
}

async function refreshV44All(force=false){
  applyV44Theme();
  await renderV44Brief();
  try{const air=await fetchV44Air(force);renderV44Air(air);}catch(error){
    console.warn('V4.4 air quality',error);
    const badge=document.getElementById('v44AqiBadge'),label=document.getElementById('v44AqiLabel'),metrics=document.getElementById('v44AirMetrics'),pollen=document.getElementById('v44PollenList');
    if(badge)badge.textContent='Indisponible';if(label)label.textContent='Données indisponibles';if(metrics)metrics.innerHTML='<div class="v44-pollen-empty">Impossible de charger la qualité de l’air.</div>';if(pollen)pollen.innerHTML='<div class="v44-pollen-empty">Impossible de charger les pollens.</div>';
  }
}
